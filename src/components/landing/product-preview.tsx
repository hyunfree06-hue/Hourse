export function ProductPreview() {
  return (
    <section id="product" className="bg-white pb-16 sm:pb-20">
      <div className="mx-auto max-w-[1120px] px-5">
        <div className="overflow-hidden rounded-[16px] border border-[rgba(17,17,19,0.08)] bg-white shadow-[0_1px_2px_rgba(17,17,19,0.04),0_12px_40px_rgba(17,17,19,0.06)]">
          {/* Top bar */}
          <div className="flex h-10 items-center justify-between border-b border-[#E4E4E7] bg-[#FAFAFA] px-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="size-[10px] rounded-full bg-[#E4E4E7]" />
                <div className="size-[10px] rounded-full bg-[#E4E4E7]" />
                <div className="size-[10px] rounded-full bg-[#E4E4E7]" />
              </div>
              <div className="ml-3 flex items-center gap-1.5 text-[11px] text-[#71717A]">
                <span className="rounded bg-white px-1.5 py-0.5 border border-[#E4E4E7] font-medium text-[#3F3F46]">
                  Untitled Project
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[#A1A1AA]">
              <span className="rounded bg-white px-1.5 py-0.5 border border-[#E4E4E7] text-[#71717A]">
                Auto-saved
              </span>
              <span className="rounded bg-white px-1.5 py-0.5 border border-[#E4E4E7] text-[#71717A]">
                Export
              </span>
            </div>
          </div>

          <div className="grid grid-cols-[52px_1fr_200px] sm:grid-cols-[52px_1fr_220px]">
            {/* Left toolbar rail */}
            <div className="flex flex-col items-center gap-1.5 border-r border-[#E4E4E7] bg-[#FAFAFA] py-3">
              <ToolIcon label="Select" active />
              <ToolIcon label="Frame" />
              <ToolIcon label="Rect" />
              <ToolIcon label="Text" />
              <ToolIcon label="Image" />
              <div className="my-1 h-px w-6 bg-[#E4E4E7]" />
              <ToolIcon label="AI" accent />
              <ToolIcon label="Hand" />
            </div>

            {/* Canvas area */}
            <div className="relative min-h-[320px] bg-white sm:min-h-[380px]">
              {/* Grid dots */}
              <div
                className="absolute inset-0 opacity-[0.35]"
                style={{
                  backgroundImage: "radial-gradient(circle, #D4D4D8 0.5px, transparent 0.5px)",
                  backgroundSize: "20px 20px",
                }}
              />

              {/* Canvas objects */}
              <div className="absolute left-8 top-8 h-[120px] w-[180px] rounded-[6px] bg-gradient-to-br from-[#EEF2FF] to-[#E0E7FF] ring-1 ring-[#C7D2FE] sm:left-12 sm:top-12 sm:h-[140px] sm:w-[220px]">
                <span className="absolute left-2 top-2 text-[10px] font-medium text-[#6366F1]">
                  hero-image.png
                </span>
              </div>

              <div className="absolute bottom-20 right-8 h-[80px] w-[140px] rounded-[6px] bg-white shadow-sm ring-1 ring-[#E4E4E7] sm:right-12 sm:h-[90px] sm:w-[160px]">
                <div className="flex h-full flex-col justify-center px-3">
                  <div className="h-2 w-16 rounded bg-[#E4E4E7]" />
                  <div className="mt-1.5 h-2 w-12 rounded bg-[#F4F4F5]" />
                </div>
              </div>

              {/* AI generation region */}
              <div className="absolute bottom-8 left-1/2 h-[100px] w-[200px] -translate-x-1/2 rounded-[8px] border-2 border-dashed border-[#635BFF]/50 bg-[#635BFF]/[0.04] sm:h-[110px] sm:w-[240px]">
                <span className="absolute -top-5 left-0 text-[10px] font-medium text-[#635BFF]">
                  AI Region &middot; 480 &times; 220
                </span>
                <div className="flex h-full items-center justify-center">
                  <span className="rounded-[6px] bg-[#635BFF]/10 px-2 py-1 text-[10px] font-medium text-[#635BFF]">
                    Generating...
                  </span>
                </div>
              </div>

              {/* Selection indicator */}
              <div className="absolute left-8 top-8 h-[120px] w-[180px] rounded-[6px] ring-2 ring-[#635BFF] sm:left-12 sm:top-12 sm:h-[140px] sm:w-[220px]">
                <div className="absolute -left-1 -top-1 size-2 rounded-full border-2 border-[#635BFF] bg-white" />
                <div className="absolute -right-1 -top-1 size-2 rounded-full border-2 border-[#635BFF] bg-white" />
                <div className="absolute -bottom-1 -left-1 size-2 rounded-full border-2 border-[#635BFF] bg-white" />
                <div className="absolute -bottom-1 -right-1 size-2 rounded-full border-2 border-[#635BFF] bg-white" />
              </div>
            </div>

            {/* Right panel — Properties + AI */}
            <div className="flex flex-col border-l border-[#E4E4E7] bg-[#FAFAFA]">
              {/* Properties */}
              <div className="border-b border-[#E4E4E7] p-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                  Properties
                </span>
                <div className="mt-2.5 space-y-2">
                  <PropertyRow label="X" value="64" />
                  <PropertyRow label="Y" value="48" />
                  <PropertyRow label="W" value="220" />
                  <PropertyRow label="H" value="140" />
                </div>
              </div>
              {/* AI Panel */}
              <div className="flex-1 p-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                  AI Generate
                </span>
                <div className="mt-2.5 space-y-2">
                  <div className="rounded-[6px] border border-[#E4E4E7] bg-white px-2.5 py-2 text-[11px] text-[#71717A]">
                    A minimal hero illustration with soft gradients...
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded border border-[#E4E4E7] bg-white px-1.5 py-0.5 text-[10px] text-[#3F3F46]">
                      FLUX
                    </span>
                    <span className="rounded border border-[#E4E4E7] bg-white px-1.5 py-0.5 text-[10px] text-[#3F3F46]">
                      Quality
                    </span>
                    <span className="ml-auto text-[10px] text-[#A1A1AA]">
                      2 cr
                    </span>
                  </div>
                  <div className="rounded-[6px] bg-[#635BFF] px-2.5 py-1.5 text-center text-[11px] font-medium text-white">
                    Generate
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom zoom bar */}
          <div className="flex h-8 items-center justify-between border-t border-[#E4E4E7] bg-[#FAFAFA] px-3 text-[10px] text-[#A1A1AA]">
            <span>100%</span>
            <span>1200 &times; 800</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ToolIcon({ label, active, accent }: { label: string; active?: boolean; accent?: boolean }) {
  return (
    <div
      className={`flex size-8 items-center justify-center rounded-[6px] text-[9px] font-medium transition-colors ${
        active
          ? "bg-white text-[#111113] shadow-sm ring-1 ring-[#E4E4E7]"
          : accent
            ? "bg-[#635BFF]/10 text-[#635BFF]"
            : "text-[#71717A] hover:bg-white hover:text-[#3F3F46]"
      }`}
      title={label}
    >
      {label.slice(0, 2)}
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-[#A1A1AA]">{label}</span>
      <span className="rounded border border-[#E4E4E7] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#3F3F46]">
        {value}
      </span>
    </div>
  );
}
