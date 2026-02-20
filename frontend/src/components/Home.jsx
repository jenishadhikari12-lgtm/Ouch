import React, { useEffect, useMemo, useState } from "react";

const Home = () => {
  const steps = useMemo(
    () => [
      { title: "Upload ID", desc: "Passport or citizenship document" },
      { title: "OCR Extraction", desc: "Automatically extract user details" },
      { title: "Selfie & Liveness", desc: "Face match with spoof protection" },
      { title: "Instant Result", desc: "Verified or flagged for review" },
    ],
    [],
  );

  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setActiveStep((p) => (p + 1) % steps.length),
      2500,
    );
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <>
      
      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl min-h-screen px-4 py-24">
          <div className="grid gap-12 lg:grid-cols-2">
            
            <div>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                Identity verification,
                <br />
                <span className="text-slate-700">
                  simplified and{" "}
                  <span className="text-emerald-600">secure</span>
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-lg text-slate-600">
                Verify users using document validation, face recognition, and
                compliance-ready audit trails — all in one platform.
              </p>
              
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex gap-2 border-b border-slate-200 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-slate-400" />
                <span className="h-3 w-3 rounded-full bg-slate-400" />
                <span className="h-3 w-3 rounded-full bg-slate-400" />
              </div>

              <div className="space-y-3 p-6">
                {steps.map((step, index) => (
                  <div
                    key={step.title}
                    className={`rounded-xl border p-4 transition ${
                      index === activeStep
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <p className="font-medium text-slate-900">{step.title}</p>
                    <p className="text-sm text-slate-600">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Home;
