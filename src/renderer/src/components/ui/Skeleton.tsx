interface SkeletonProps {
  className?: string
}

/** Generic shimmering block — size it with className (w-*, h-*, rounded-*). */
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`shimmer rounded-md ${className}`} aria-hidden="true" />
}

interface SkeletonTextProps {
  /** Number of text lines (default 3). */
  lines?: number
  className?: string
}

/** A paragraph of shimmering lines with a naturally shorter last line. */
export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="shimmer rounded h-3"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )
}

/** Card-shaped placeholder: icon bubble + title + text lines. */
export function SkeletonCard({ className = '' }: SkeletonProps) {
  return (
    <div className={`glass rounded-xl p-4 ${className}`} aria-hidden="true">
      <div className="flex items-center gap-3 mb-4">
        <div className="shimmer rounded-xl w-10 h-10 shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <div className="shimmer rounded h-3 w-1/2" />
          <div className="shimmer rounded h-2.5 w-1/3" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  )
}

export default Skeleton
