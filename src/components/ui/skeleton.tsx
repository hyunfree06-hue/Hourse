import { cn } from "@/lib/utils/cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-neutral-200/80", className)}
      {...props}
    />
  );
}

export { Skeleton };
