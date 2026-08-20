import { ImageResponse } from "next/og"
import { photoService } from "@/server/service/photo-service"
import { getPhotoDeviceParams, getPhotoShootingParams } from "@/lib/viewer-field"

export const runtime = "nodejs"
export const alt = "Photo preview"
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = "image/png"

interface Props {
  params: Promise<{ photoId: string }>
}

export default async function Image({ params }: Props) {
  const { photoId } = await params
  const appName = process.env.TITLE || "NayPict"

  let photo = null
  try {
    photo = await photoService.getById(photoId)
  } catch (err) {
    console.error("OpenGraph image getById error:", err)
  }

  if (!photo) {
    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#09090b",
            color: "#ffffff",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 12 }}>{appName}</div>
          <div style={{ fontSize: 20, color: "#a1a1aa" }}>Photo not found or unavailable</div>
        </div>
      ),
      { ...size }
    )
  }

  // Extract EXIF device and shooting metadata
  const deviceParams = getPhotoDeviceParams(photo.exif)
  const shootingParams = getPhotoShootingParams(photo.exif)
  const camera = deviceParams.find((p) => p.key === "camera")?.value
  const lens = deviceParams.find((p) => p.key === "lens")?.value
  const shutter = shootingParams.find((p) => p.key === "shutter")?.value
  const aperture = shootingParams.find((p) => p.key === "aperture")?.value
  const focalLength = shootingParams.find((p) => p.key === "focalLength")?.value
  const iso = shootingParams.find((p) => p.key === "iso")?.value

  // Use preview or thumbnail URL as the main featured image
  const displayImageUrl = photo.preview || photo.thumbnail || photo.key || ""

  // Format date if present
  let formattedDate = ""
  if (photo.takenTime) {
    try {
      const d = new Date(photo.takenTime.replace(/:/g, "-"))
      if (!isNaN(d.getTime())) {
        formattedDate = d.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      } else {
        formattedDate = photo.takenTime.slice(0, 10)
      }
    } catch {
      formattedDate = photo.takenTime.slice(0, 10)
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: "#09090b",
          color: "#ffffff",
          fontFamily: "sans-serif",
          padding: 40,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {/* Subtle Background Glow Accent */}
        <div
          style={{
            position: "absolute",
            top: -100,
            left: -100,
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(0,0,0,0) 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -100,
            right: -100,
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, rgba(0,0,0,0) 70%)",
          }}
        />

        {/* Content Container */}
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            gap: 40,
            alignItems: "center",
            zIndex: 10,
          }}
        >
          {/* Left Column: Photo Card */}
          <div
            style={{
              display: "flex",
              width: 580,
              height: 550,
              borderRadius: 20,
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
              backgroundColor: "#18181b",
              position: "relative",
            }}
          >
            {displayImageUrl ? (
              <img
                src={displayImageUrl}
                alt={photo.name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#71717a",
                }}
              >
                Photo Preview
              </div>
            )}
          </div>

          {/* Right Column: Metadata & Details */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              height: 550,
              justifyContent: "space-between",
              paddingTop: 10,
              paddingBottom: 10,
            }}
          >
            {/* Top Branding & Title */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: 999,
                    padding: "6px 14px",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#e4e4e7",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  📸 {appName} Gallery
                </div>

                {formattedDate && (
                  <div
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.06)",
                      borderRadius: 999,
                      padding: "6px 14px",
                      fontSize: 14,
                      color: "#a1a1aa",
                    }}
                  >
                    📅 {formattedDate}
                  </div>
                )}
              </div>

              <div
                style={{
                  fontSize: 34,
                  fontWeight: 700,
                  color: "#ffffff",
                  lineHeight: 1.2,
                  maxHeight: 85,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {photo.name}
              </div>
            </div>

            {/* Middle: Camera & EXIF Specs */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 16,
                padding: 20,
              }}
            >
              {camera && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#f4f4f5",
                  }}
                >
                  📷 {camera}
                </div>
              )}

              {lens && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 14,
                    color: "#a1a1aa",
                  }}
                >
                  🔍 {lens}
                </div>
              )}

              {/* Shooting Settings Badges */}
              {(shutter || aperture || focalLength || iso) && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  {focalLength && (
                    <div
                      style={{
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#e4e4e7",
                      }}
                    >
                      {focalLength}
                    </div>
                  )}
                  {aperture && (
                    <div
                      style={{
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#e4e4e7",
                      }}
                    >
                      {aperture}
                    </div>
                  )}
                  {shutter && (
                    <div
                      style={{
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#e4e4e7",
                      }}
                    >
                      {shutter}
                    </div>
                  )}
                  {iso && (
                    <div
                      style={{
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#e4e4e7",
                      }}
                    >
                      ISO {iso}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Footer Info */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 14,
                color: "#71717a",
              }}
            >
              <div>
                {photo.width && photo.height ? `${photo.width} × ${photo.height} px` : ""}
              </div>
              <div style={{ color: "#38bdf8", fontWeight: 500 }}>
                View in high resolution →
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
