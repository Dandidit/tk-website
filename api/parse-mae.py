import json
import os
import re
import tempfile
from datetime import datetime
from http.server import BaseHTTPRequestHandler

import fitz
import psycopg
from vercel.blob import AsyncBlobClient

def clean_amount(val):
    if val is None or val == "":
        return None
    clean_val = re.sub(r'[^\d.,+-]', '', str(val))
    return clean_val or None

def process_mae_debit(pdf_path):
    # Based on the Maybank debit-processing logic in:
    # OAT7963/mae_pdf_processing/MAE_PDF_File_Processor.py
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()

    lines = text.split("\n")

    def remove_sections(lines, start_marker, end_marker):
        result = []
        skip = False
        for line in lines:
            if start_marker in line:
                skip = True
                continue
            if end_marker in line:
                skip = False
                continue
            if not skip:
                result.append(line)
        return result

    lines = remove_sections(lines, "Maybank Islamic Berhad",
                            "Please notify us of any change of address in writing.")
    lines = remove_sections(
        lines,
        "15th Floor, Tower A, Dataran Maybank, 1, Jalan Maarof, 59000 Kuala Lumpur",
        "請通知本行在何地址更换."
    )
    lines = remove_sections(lines, "ENTRY DATE", "STATEMENT BALANCE")
    lines = remove_sections(lines, "ENDING BALANCE :", "TOTAL DEBIT :")

    strings_to_remove = [
        "URUSNIAGA AKAUN/ 戶口進支項 /ACCOUNT TRANSACTIONS",
        "TARIKH MASUK", "BUTIR URUSNIAGA", "JUMLAH URUSNIAGA",
        "BAKI PENYATA", "進支日期", "進支項說明", "银碼", "結單存餘",
        "URUSNIAGA AKAUN/ 戶口進支項/ACCOUNT TRANSACTIONS",
        "TARIKH NILAI", "仄過賬日期", "戶號"
    ]

    filtered_lines = [
        line for line in lines
        if not any(s in line for s in strings_to_remove)
    ]

    structured_data = []
    temp_entry = {}
    date_pattern = re.compile(r"\d{2}/\d{2}")

    for line in filtered_lines:
        line = line.strip()

        if date_pattern.match(line):
            if temp_entry:
                structured_data.append(temp_entry)
            temp_entry = {
                "Entry Date": line,
                "Transaction Description": "",
                "Transaction Amount": "",
                "Statement Balance": ""
            }
        elif temp_entry.get("Transaction Amount") and temp_entry.get("Statement Balance") == "":
            temp_entry["Statement Balance"] = line
        elif temp_entry.get("Transaction Amount") == "":
            temp_entry["Transaction Amount"] = line
        elif temp_entry:
            temp_entry["Transaction Description"] += line + ", "

    if temp_entry:
        structured_data.append(temp_entry)

    if not structured_data:
        raise ValueError("No transactions extracted from the Maybank PDF.")

    year_match = re.search(r"\b(20\d{2})\b", text)
    if year_match:
        year = int(year_match.group(1))
    else:
        first_date = re.search(r"\d{2}/\d{2}/\d{2}", text)
        if not first_date:
            raise ValueError("Could not determine statement year.")
        year = 2000 + int(first_date.group(0).split("/")[-1])

    rows = []

    for entry in structured_data:
        try:
            tx_date = datetime.strptime(
                f"{entry['Entry Date']}/{year}",
                "%d/%m/%Y"
            ).date()
        except ValueError:
            continue

        amount_raw = clean_amount(entry["Transaction Amount"])
        balance_raw = clean_amount(entry["Statement Balance"])

        if not amount_raw:
            continue

        try:
            amount = float(re.sub(r"[^\d.]", "", amount_raw))
        except ValueError:
            continue

        balance = None
        if balance_raw:
            try:
                balance = float(re.sub(r"[^\d.]", "", balance_raw))
            except ValueError:
                pass

        flow = (
            "received" if "+" in amount_raw
            else "spent" if "-" in amount_raw
            else None
        )

        rows.append({
            "transaction_date": tx_date,
            "description": entry["Transaction Description"].rstrip(", "),
            "spent": amount if flow == "spent" else None,
            "received": amount if flow == "received" else None,
            "balance": balance
        })

    if not rows:
        raise ValueError("No usable Maybank transactions extracted.")

    return rows

def save_results(statement_id, rows):
    with psycopg.connect(os.environ["terakira_db_DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM bank_transactions WHERE statement_id = %s",
                (statement_id,)
            )

            for tx in rows:
                duplicate_key = "|".join([
                    tx["transaction_date"].isoformat(),
                    tx["description"] or "",
                    str(tx["spent"] if tx["spent"] is not None else ""),
                    str(tx["received"] if tx["received"] is not None else ""),
                    str(tx["balance"] if tx["balance"] is not None else "")
                ])

                cur.execute("""
                    INSERT INTO bank_transactions (
                        statement_id,
                        transaction_date,
                        description,
                        spent,
                        received,
                        balance,
                        duplicate_key
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (statement_id, duplicate_key)
                    WHERE duplicate_key IS NOT NULL
                    DO NOTHING
                """, (
                    statement_id,
                    tx["transaction_date"],
                    tx["description"],
                    tx["spent"],
                    tx["received"],
                    tx["balance"],
                    duplicate_key
                ))

            dates = [tx["transaction_date"] for tx in rows]
            balances = [tx["balance"] for tx in rows if tx["balance"] is not None]

            cur.execute("""
                UPDATE bank_statements
                SET
                    parse_status = 'success',
                    parsed_at = NOW(),
                    parse_error = NULL,
                    statement_start_date = %s,
                    statement_end_date = %s,
                    ending_balance = %s
                WHERE id = %s
            """, (
                min(dates) if dates else None,
                max(dates) if dates else None,
                balances[-1] if balances else None,
                statement_id
            ))

        conn.commit()

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.headers.get("x-parser-secret") != os.environ.get("PARSER_SECRET"):
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Unauthorized"}).encode())
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            statement_id = body["statementId"]
            storage_path = body["storagePath"]

            client = AsyncBlobClient()
            # Run the async SDK from this synchronous Vercel handler.
            import asyncio

            async def read_blob():
                result = await client.get(storage_path, access="private")
                print(type(result))
                print(dir(result))
                if result is None or result.status_code != 200:
                    raise ValueError("Stored PDF could not be read.")
                chunks = []
                async for chunk in result.stream:
                    chunks.append(chunk)
                return b"".join(chunks)

            pdf_bytes = asyncio.run(read_blob())

            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(pdf_bytes)
                pdf_path = tmp.name

            try:
                rows = process_mae_debit(pdf_path)
            finally:
                os.unlink(pdf_path)

            save_results(statement_id, rows)

            payload = {"success": True, "statementId": statement_id, "count": len(rows)}
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode())

        except Exception as exc:
            try:
                statement_id = body.get("statementId")
                if statement_id:
                    with psycopg.connect(os.environ["terakira_db_DATABASE_URL"]) as conn:
                        with conn.cursor() as cur:
                            cur.execute(
                                "UPDATE bank_statements SET parse_status='failed', parse_error=%s WHERE id=%s",
                                (str(exc), statement_id)
                            )
                        conn.commit()
            except Exception:
                pass

            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(exc)}).encode())
