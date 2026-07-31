CREATE TABLE IF NOT EXISTS consultation_submissions (
    id BIGSERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    business_name VARCHAR(200),
    email VARCHAR(254) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    monthly_revenue VARCHAR(30) NOT NULL,
    current_bookkeeping VARCHAR(30) NOT NULL,
    bookkeeping_method VARCHAR(20) NOT NULL,
    closing_frequency VARCHAR(20) NOT NULL,
    contact_reason VARCHAR(30) NOT NULL,
    support_timeline VARCHAR(20) NOT NULL,
    consent BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    security_data_cleared_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_consultation_submissions_ip_submitted
    ON consultation_submissions (ip_address, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_consultation_submissions_submitted_at
    ON consultation_submissions (submitted_at);
