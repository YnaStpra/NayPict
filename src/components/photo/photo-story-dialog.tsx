// This component renders an interactive Instagram Story Card & QR Code Generator dialog with live 9:16 canvas preview.

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Camera,
  Check,
  Copy,
  Download,
  Layers,
  Loader2,
  QrCode,
  Share2,
  Sparkles,
} from "lucide-react";
import { InstagramIcon } from "@/components/icons/instagram";
import { type PhotoVo } from "@/server/entity/vo/photo";
import {
  renderStoryCardToCanvas,
  shareStoryImage,
  downloadStoryCard,
  copyStoryImageToClipboard,
  type StoryTemplate,
  type StoryCardOptions,
} from "@/lib/story-card";
import { useApp } from "@/app/provider";

interface PhotoStoryDialogProps {
  photo: PhotoVo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PhotoStoryDialog({ photo, open, onOpenChange }: PhotoStoryDialogProps) {
  const { title: galleryTitle, userInfo } = useApp();
  // canvasRef references the hidden full-resolution 1080x1920 canvas for rendering
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // previewCanvasRef references the visible live preview canvas
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Template style state
  const [template, setTemplate] = useState<StoryTemplate>("minimalist");
  // Options state
  const [showTitle, setShowTitle] = useState(true);
  const [showExif, setShowExif] = useState(true);
  const [showQrCode, setShowQrCode] = useState(true);
  const [showLocation, setShowLocation] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [photographerName, setPhotographerName] = useState(userInfo?.username || "");
  
  // Generating / Loading state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [currentBlob, setCurrentBlob] = useState<Blob | null>(null);
  const [copied, setCopied] = useState(false);

  // Update photographer name when userInfo changes
  useEffect(() => {
    if (userInfo?.username && !photographerName) {
      setPhotographerName(userInfo.username);
    }
  }, [userInfo?.username, photographerName]);

  // Compute absolute photo URL
  const photoUrl = typeof window !== "undefined" && photo
    ? `${window.location.origin}/photo/${photo.photoId}`
    : "";

  /**
   * Render the 1080x1920 story card to canvas and generate high-res Blob.
   */
  const generateStoryCard = useCallback(async () => {
    if (!photo || !open) return;

    setIsGenerating(true);
    try {
      const options: StoryCardOptions = {
        template,
        showTitle,
        showExif,
        showQrCode,
        showLocation,
        showDate,
        photographerName,
        galleryTitle: galleryTitle || "NayPict",
        photoUrl,
      };

      const canvas = await renderStoryCardToCanvas(photo, options, canvasRef.current || undefined);
      canvasRef.current = canvas;

      // Copy rendered output to live preview canvas
      if (previewCanvasRef.current) {
        const previewCanvas = previewCanvasRef.current;
        previewCanvas.width = canvas.width;
        previewCanvas.height = canvas.height;
        const pCtx = previewCanvas.getContext("2d");
        if (pCtx) {
          pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
          pCtx.drawImage(canvas, 0, 0);
        }
      }

      // Convert full canvas to high-res Blob
      canvas.toBlob(
        (blob) => {
          setCurrentBlob(blob);
          setIsGenerating(false);
        },
        "image/png",
        1.0
      );
    } catch {
      setIsGenerating(false);
      toast.error("Failed to generate Story Card. Please try again.");
    }
  }, [photo, open, template, showTitle, showExif, showQrCode, showLocation, showDate, photographerName, galleryTitle, photoUrl]);

  // Re-generate canvas whenever dialog opens or options change
  useEffect(() => {
    if (open && photo) {
      const timer = setTimeout(() => {
        generateStoryCard();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, photo, generateStoryCard]);

  /**
   * Share generated image directly using Web Share API Level 2.
   */
  const handleShareToInstagram = async () => {
    if (!currentBlob) {
      toast.error("Story Card is still generating...");
      return;
    }

    setIsSharing(true);
    try {
      const shared = await shareStoryImage(currentBlob, photo?.name || "NayPict Photo");
      if (shared) {
        toast.success("Ready to share to Instagram Story!");
      } else {
        // Fallback: Download and copy link
        downloadStoryCard(currentBlob, `${photo?.name || "photo"}-story.png`);
        toast.info("Image downloaded! Open Instagram to share your Story.");
      }
    } catch {
      downloadStoryCard(currentBlob, `${photo?.name || "photo"}-story.png`);
      toast.info("Image downloaded to device.");
    } finally {
      setIsSharing(false);
    }
  };

  /**
   * Direct download of full-res PNG file.
   */
  const handleDownload = () => {
    if (!currentBlob) return;
    downloadStoryCard(currentBlob, `${photo?.name?.replace(/\.[^/.]+$/, "") || "naypict"}-story.png`);
    toast.success("High-res 1080x1920 Story Card downloaded!");
  };

  /**
   * Copy image to clipboard.
   */
  const handleCopyImage = async () => {
    if (!currentBlob) return;
    const success = await copyStoryImageToClipboard(currentBlob);
    if (success) {
      setCopied(true);
      toast.success("Story Card image copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    } else {
      toast.error("Clipboard copy not supported in this browser. Use Download instead.");
    }
  };

  /**
   * Copy direct photo web link.
   */
  const handleCopyLink = async () => {
    if (!photoUrl) return;
    try {
      await navigator.clipboard.writeText(photoUrl);
      toast.success("Photo link copied to clipboard!");
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  if (!photo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-3xl md:max-w-4xl lg:max-w-5xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 md:p-8 bg-zinc-950/95 text-white backdrop-blur-2xl border border-white/10 shadow-2xl rounded-2xl">
        <DialogHeader className="mb-2">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-500 text-white shadow-lg shadow-pink-500/25">
              <InstagramIcon className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight text-white">
                Instagram Story & Card Generator
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-zinc-400">
                Generate high-resolution 9:16 story cards with EXIF specs & scan QR codes.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 items-start mt-3">
          {/* Left: Phone Screen Mockup Live Preview */}
          <div className="md:col-span-5 flex flex-col items-center justify-center">
            <div className="relative w-full max-w-[260px] sm:max-w-[280px] lg:max-w-[300px] aspect-[9/16] rounded-[36px] p-2.5 bg-gradient-to-b from-zinc-700 via-zinc-900 to-black shadow-2xl ring-1 ring-white/20">
              {/* Phone Speaker & Dynamic Island */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-full z-20 flex items-center justify-center">
                <div className="size-2 rounded-full bg-zinc-800 ml-6" />
              </div>

              {/* Story Canvas Container */}
              <div className="relative w-full h-full rounded-[28px] overflow-hidden bg-black flex items-center justify-center">
                {isGenerating && (
                  <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-white text-xs">
                    <Loader2 className="size-6 animate-spin text-pink-500" />
                    <span>Rendering 1080×1920 HD...</span>
                  </div>
                )}
                <canvas
                  ref={previewCanvasRef}
                  className="w-full h-full object-cover rounded-[28px]"
                />
              </div>
            </div>

            {/* Resolution Badge */}
            <div className="mt-3.5 flex items-center gap-1.5 text-xs text-zinc-400 bg-white/5 px-3.5 py-1.5 rounded-full border border-white/10">
              <Sparkles className="size-3.5 text-amber-400" />
              <span>Output: 1080 × 1920 px (9:16 HD)</span>
            </div>
          </div>

          {/* Right: Customization Controls & Actions */}
          <div className="md:col-span-7 flex flex-col gap-5">
            {/* Template Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Card Style & Template
              </Label>
              <Tabs
                value={template}
                onValueChange={(val: string) => setTemplate(val as StoryTemplate)}
                className="w-full"
              >
                <TabsList className="grid grid-cols-2 w-full h-11 p-1 bg-white/10 border border-white/10 rounded-xl">
                  <TabsTrigger value="minimalist" className="text-xs sm:text-sm font-medium flex items-center justify-center gap-2 text-zinc-300 data-[state=active]:bg-white data-[state=active]:text-zinc-950 rounded-lg transition-all">
                    <Layers className="size-4" />
                    Minimalist Exhibition
                  </TabsTrigger>
                  <TabsTrigger value="cinematic" className="text-xs sm:text-sm font-medium flex items-center justify-center gap-2 text-zinc-300 data-[state=active]:bg-white data-[state=active]:text-zinc-950 rounded-lg transition-all">
                    <Camera className="size-4" />
                    Cinematic Full-Bleed
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Content Toggles */}
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 shadow-sm">
              <Label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Display Options
              </Label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Toggle EXIF */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                  <Label htmlFor="toggle-exif" className="text-xs sm:text-sm font-medium cursor-pointer text-zinc-200">
                    Camera & Lens EXIF
                  </Label>
                  <Switch
                    id="toggle-exif"
                    checked={showExif}
                    onCheckedChange={setShowExif}
                  />
                </div>

                {/* Toggle QR Code */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                  <Label htmlFor="toggle-qr" className="text-xs sm:text-sm font-medium cursor-pointer flex items-center gap-1.5 text-zinc-200">
                    <QrCode className="size-4 text-zinc-400" />
                    Scan QR Code
                  </Label>
                  <Switch
                    id="toggle-qr"
                    checked={showQrCode}
                    onCheckedChange={setShowQrCode}
                  />
                </div>

                {/* Toggle Location */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                  <Label htmlFor="toggle-loc" className="text-xs sm:text-sm font-medium cursor-pointer text-zinc-200">
                    GPS Coordinates
                  </Label>
                  <Switch
                    id="toggle-loc"
                    checked={showLocation}
                    onCheckedChange={setShowLocation}
                  />
                </div>

                {/* Toggle Title */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                  <Label htmlFor="toggle-title" className="text-xs sm:text-sm font-medium cursor-pointer text-zinc-200">
                    Photo File Name
                  </Label>
                  <Switch
                    id="toggle-title"
                    checked={showTitle}
                    onCheckedChange={setShowTitle}
                  />
                </div>
              </div>
            </div>

            {/* Photographer Signature Input */}
            <div className="space-y-2">
              <Label htmlFor="photographer-name" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Photographer / Signature Credit
              </Label>
              <Input
                id="photographer-name"
                value={photographerName}
                onChange={(e) => setPhotographerName(e.target.value)}
                placeholder="e.g. Yan Saputra"
                className="h-10 bg-white/5 border-white/10 text-white placeholder:text-zinc-500 rounded-xl text-sm focus-visible:ring-pink-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              {/* Primary: Share to Instagram Stories */}
              <Button
                type="button"
                onClick={handleShareToInstagram}
                disabled={isGenerating || isSharing || !currentBlob}
                className="w-full h-12 text-sm sm:text-base font-semibold rounded-xl bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white shadow-lg shadow-pink-500/25 hover:opacity-95 transition-all cursor-pointer"
              >
                {isSharing ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Preparing Share...
                  </>
                ) : (
                  <>
                    <InstagramIcon className="size-5 mr-2" />
                    Share to Instagram Story
                  </>
                )}
              </Button>

              {/* Secondary Buttons Grid */}
              <div className="grid grid-cols-3 gap-2.5">
                {/* Download */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={isGenerating || !currentBlob}
                  className="h-10 text-xs sm:text-sm flex items-center justify-center gap-1.5 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white cursor-pointer"
                >
                  <Download className="size-4" />
                  Download
                </Button>

                {/* Copy Image */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyImage}
                  disabled={isGenerating || !currentBlob}
                  className="h-10 text-xs sm:text-sm flex items-center justify-center gap-1.5 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white cursor-pointer"
                >
                  {copied ? <Check className="size-4 text-green-400" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy Image"}
                </Button>

                {/* Copy Link */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  className="h-10 text-xs sm:text-sm flex items-center justify-center gap-1.5 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white cursor-pointer"
                >
                  <Share2 className="size-4" />
                  Copy Link
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
