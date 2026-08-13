'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Floating Back-to-Top button appearing when user scrolls down
export function BackToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 250) {
        setVisible(true)
      } else {
        setVisible(false)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  if (!visible) return null

  return (
    <Button
      type="button"
      size="icon"
      onClick={scrollToTop}
      className="fixed bottom-6 right-6 z-40 size-10 rounded-full shadow-lg border border-border/40 transition-all duration-300 hover:scale-110 active:scale-95 bg-primary text-primary-foreground"
      aria-label="Back to top"
      title="Kembali ke atas"
    >
      <ArrowUp className="size-5" />
    </Button>
  )
}
