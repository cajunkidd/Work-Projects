interface Props {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export default function Card({ children, className = '', onClick }: Props) {
  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-xl p-4 ${onClick ? 'cursor-pointer hover:border-slate-600 transition-colors' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
