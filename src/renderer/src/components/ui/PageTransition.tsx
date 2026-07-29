import { useLocation } from 'react-router-dom'

interface Props {
  children: React.ReactNode
  className?: string
}

/**
 * Wrap route content to replay a fade/slide/blur entrance whenever the route
 * changes. The `key` swap remounts the wrapper so the CSS animation restarts.
 */
export default function PageTransition({ children, className = '' }: Props) {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className={`page-enter ${className}`}>
      {children}
    </div>
  )
}
