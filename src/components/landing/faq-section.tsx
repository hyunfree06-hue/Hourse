const faqs = [
  {
    q: "Is Hourse a team collaboration tool?",
    a: "No. Hourse is a personal workspace for individual creators. Projects are private to your account.",
  },
  {
    q: "Can I start for free?",
    a: "Yes. Sign in with Google to receive free credits immediately. No credit card required.",
  },
  {
    q: "Which AI models are available?",
    a: "You can choose between OpenAI image generation and Black Forest Labs FLUX. Select per generation based on style or cost.",
  },
  {
    q: "What file formats can I export?",
    a: "PNG, JPG, and SVG. Export the full canvas or individual selections.",
  },
  {
    q: "Do unused credits expire?",
    a: "Credits from one-time packs never expire. Monthly subscription credits refresh each billing cycle.",
  },
];

export function FaqSection() {
  return (
    <section className="border-t border-[#E4E4E7] bg-[#F7F7F8]">
      <div className="mx-auto max-w-[1120px] px-5 py-16 sm:py-20">
        <h2 className="text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-[#111113] sm:text-[32px]">
          Frequently asked questions
        </h2>
        <div className="mt-10 divide-y divide-[#E4E4E7] border-y border-[#E4E4E7]">
          {faqs.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-medium text-[#111113]">
                {item.q}
                <span className="ml-4 text-[#A1A1AA] transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 text-[13px] leading-[1.6] text-[#71717A]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
