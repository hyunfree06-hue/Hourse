import { BoxSelect, Wand2, Layers } from "lucide-react";

const features = [
  {
    icon: BoxSelect,
    title: "Generate in context",
    description:
      "Select an area, describe what you need, and place the result exactly where your composition needs it.",
  },
  {
    icon: Wand2,
    title: "Refine without breaking flow",
    description:
      "Adjust layout, color, scale, type, and imagery in the same focused workspace.",
  },
  {
    icon: Layers,
    title: "Choose the right model",
    description:
      "Switch between leading image models based on the speed, control, and finish your work requires.",
  },
];

export function ValueSection() {
  return (
    <section className="border-t border-[#E4E4E7] bg-white">
      <div className="mx-auto max-w-[1120px] px-5 py-16 sm:py-20">
        <div className="max-w-lg">
          <h2 className="text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-[#111113] sm:text-[32px]">
            Create without leaving the canvas.
          </h2>
          <p className="mt-3 text-[15px] leading-[1.6] text-[#71717A]">
            Generate new directions, reshape selected areas, and keep every idea
            editable from the moment it appears.
          </p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="space-y-3">
              <div className="flex size-9 items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-[#FAFAFA] text-[#3F3F46]">
                <f.icon className="size-[18px]" aria-hidden />
              </div>
              <h3 className="text-[15px] font-semibold text-[#111113]">
                {f.title}
              </h3>
              <p className="text-[13px] leading-[1.6] text-[#71717A]">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
