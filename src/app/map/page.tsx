import { Metadata } from "next"
import PhotoMapView from "@/components/map/photo-map-view"

export const metadata: Metadata = {
  title: "Photo Map Explorer | NayPict",
  description: "Explore world photos on an interactive GPS map with visual location markers.",
}

export default function MapPage() {
  return <PhotoMapView />
}
