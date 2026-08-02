const steps = [
  {
    step: "01",
    title: "Define the space",
    description:
      "Draw a generation area directly inside your composition.",
  },
  {
    step: "02",
    title: "Describe the outcome",
    description:
      "Write a clear prompt and choose the generation mode that fits your intent.",
  },
  {
    step: "03",
    title: "Make it yours",
    description:
      "Resize, crop, layer, and refine the result like any other canvas element.",
  },
];

export function WorkflowSection() {
  return (
    <section id="workflow" className="border-t border-[rgba(17,17,19,0.08)] bg-[#F7F7F8]">
      <div className="mx-auto max-w-[1120px] px-5 py-14 sm:py-16">
        <div className="max-w-lg">
          <h2 className="text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-[#111113] sm:text-[32px]">
            From blank canvas to visual direction.
          </h2>
        </div>
        <ol className="mt-10 grid gap-8 sm:grid-cols-3">
          {steps.map((item) => (
            <li key={item.step}>
              <span className="text-[12px] font-medium tracking-wide text-[#635BFF]">
                {item.step}
              </span>
              <h3 className="mt-2 text-[15px] font-semibold text-[#111113]">
                {item.title}
              </h3>
              <p className="mt-2 text-[13px] leading-[1.6] text-[#71717A]">
                {item.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
