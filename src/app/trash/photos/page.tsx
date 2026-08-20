'use client'

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Redirect legacy /trash/photos route to /trash
export default function TrashPhotosRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/trash")
  }, [router])

  return null
}
