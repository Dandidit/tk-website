
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";

export default function CatchUpBookkeepingPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Hero */}
      <section className="px-6 py-20 max-w-6xl mx-auto text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-bold mb-6"
        >
          Catch‑Up Bookkeeping, Done Right
        </motion.h1>
        <p className="text-lg text-gray-600 max-w-3xl mx-auto mb-8">
          Years behind on bookkeeping or taxes? Our experts help you get fully
          caught up with accurate, tax‑ready financials—fast.
        </p>
        <Button size="lg" className="rounded-2xl shadow">
          Talk to an expert free
        </Button>
      </section>

      {/* Who it's for */}
      <section className="px-6 py-16 max-w-6xl mx-auto">
        <h2 className="text-2xl font-semibold text-center mb-10">
          Designed for businesses that are
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {["Behind on taxes", "Overwhelmed by bookkeeping", "Preparing for audits or loans"].map((item) => (
            <Card key={item} className="rounded-2xl shadow-sm">
              <CardContent className="p-6 flex items-center gap-3">
                <CheckCircle className="text-green-600" />
                <span>{item}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="px-6 py-16 bg-white">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-3xl font-semibold mb-4">Why choose us</h2>
            <p className="text-gray-600 mb-6">
              Getting back on track starts with clean, reliable books. We handle
              the heavy lifting while keeping you informed every step.
            </p>
            <ul className="space-y-3">
              {["Dedicated bookkeeping team", "Fixed, transparent pricing", "Tax‑ready financials"].map(
                (b) => (
                  <li key={b} className="flex items-center gap-2">
                    <CheckCircle className="text-green-600" size={18} />
                    <span>{b}</span>
                  </li>
                )
              )}
            </ul>
          </div>
          <Card className="rounded-2xl shadow">
            <CardContent className="p-8">
              <p className="text-sm text-gray-500 mb-2">From behind to compliant</p>
              <p className="font-medium">
                Up‑to‑date books, reduced penalties, and confidence when filing
                your taxes.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-16 max-w-6xl mx-auto">
        <h2 className="text-3xl font-semibold text-center mb-12">How it works</h2>
        <div className="grid md:grid-cols-5 gap-4 text-center">
          {["Free consult", "Review your backlog", "Reconcile accounts", "Prepare financials", "Ongoing support"].map(
            (step, i) => (
              <Card key={step} className="rounded-2xl">
                <CardContent className="p-6">
                  <p className="text-sm text-gray-500">Step {i + 1}</p>
                  <p className="font-medium mt-2">{step}</p>
                </CardContent>
              </Card>
            )
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 bg-gray-900 text-white text-center">
        <h2 className="text-3xl font-semibold mb-4">Get back on track today</h2>
        <p className="text-gray-300 mb-8">
          Start with a free consultation and see how quickly you can get caught up.
        </p>
        <Button size="lg" variant="secondary" className="rounded-2xl">
          Talk to an expert free
        </Button>
      </section>
    </div>
  );
}
