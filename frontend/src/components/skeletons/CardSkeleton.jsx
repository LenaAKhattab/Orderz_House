import { SkBox, SkLine } from "./SkeletonPrimitives";

/** Generic SaaS card placeholder (image + lines). */
export default function CardSkeleton({ className = "" }) {
  return (
    <div
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm sm:p-4 ${className}`.trim()}
      aria-hidden
    >
      <SkBox className="aspect-[16/10] w-full rounded-xl" />
      <div className="mt-3 flex flex-col gap-2 px-0.5">
        <SkLine className="h-4 w-[58%] rounded-md" />
        <SkLine className="h-3 w-full rounded-md opacity-90" />
        <SkLine className="h-3 w-[85%] rounded-md opacity-85" />
      </div>
    </div>
  );
}
