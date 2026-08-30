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

      // Convert full canvas to Blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            setCurrentBlob(blob);
          }
          setIsGenerating(false);
        },
        "image/png",
        0.95
      );
    } catch {
      setIsGenerating(false);
      toast.error("Failed to generate Story Card. Please try again.");
    }
  }, [photo, open, template, showTitle, showExif, showQrCode, showLocation, showDate, photographerName, galleryTitle, photoUrl]);

  // Re-generate canvas whenever dialog opens or options change
  useEffect(() => {
    if (open && photo) {
      generateStoryCard();
    }
  }, [open, photo, generateStoryCard]);

  /**
   * Handle Instagram Story / Native Web Share.
   */
  const handleShareToInstagram = async () => {
    if (!currentBlob) return;
    setIsSharing(true);

    try {
      const shared = await shareStoryImage(currentBlob, photo?.name || "NayPict Story");
      if (shared) {
        toast.success("Shared successfully!");
      } else {
        // Fallback: auto-download and prompt user
        downloadStoryCard(currentBlob, `${photo?.name || "naypict"}-story.png`);
        toast.info("Image downloaded! You can now post it to your Instagram Story.");
      }
    } catch {
      toast.error("Sharing failed. Image has been downloaded for you.");
      if (currentBlob) {
        downloadStoryCard(currentBlob, `${photo?.name || "naypict"}-story.png`);
      }
    } finally {
      setIsSharing(false);
    }
  };

  /**
   * Handle direct 1080x1920 HD download.
   */
  const handleDownload = () => {
    if (!currentBlob) return;
    downloadStoryCard(currentBlob, `${photo?.name?.replace(/\.[^/.]+$/, "") || "naypict"}-story.png`);
    toast.success("Story card downloaded (1080x1920 HD)!");
  };

  /**
   * Handle copying image to clipboard.
   */
  const handleCopyImage = async () => {
    if (!currentBlob) return;
    const success = await copyStoryImageToClipboard(currentBlob);
    if (success) {
      setCopied(true);
      toast.success("Story card copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy image to clipboard. Try downloading instead.");
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 bg-background/95 backdrop-blur-xl border border-border/80 shadow-2xl">
        <DialogHeader className="mb-2">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-500 text-white shadow-md">
              <InstagramIcon className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Instagram Story & Card Generator
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                Generate high-resolution 9:16 story cards with EXIF specs & scan QR codes.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start mt-2">
          {/* Left: Phone Screen Mockup Preview */}
          <div className="md:col-span-5 flex flex-col items-center justify-center">
            <div className="relative w-full max-w-[280px] sm:max-w-[300px] aspect-[9/16] rounded-[36px] p-2.5 bg-gradient-to-b from-zinc-700 via-zinc-900 to-black shadow-2xl ring-1 ring-white/20">
              {/* Phone Speaker & Dynamic Island */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-full z-20 flex items-center justify-center">
                <div className="size-2 rounded-full bg-zinc-800 ml-6" />
              </div>

              {/* Story Canvas Container */}
              <div className="relative w-full h-full rounded-[28px] overflow-hidden bg-black flex items-center justify-center">
                {isGenerating && (
                  <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-white text-xs">
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
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/60 px-3 py-1 rounded-full border">
              <Sparkles className="size-3 text-amber-500" />
              <span>Output: 1080 × 1920 px (9:16 HD)</span>
            </div>
          </div>

          {/* Right: Customization Controls & Actions */}
          <div className="md:col-span-7 flex flex-col gap-5">
            {/* Template Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Card Style & Template
              </Label>
              <Tabs
                value={template}
                onValueChange={(val: string) => setTemplate(val as StoryTemplate)}
                className="w-full"
              >
                <TabsList className="grid grid-cols-2 w-full h-10 p-1 bg-muted/80">
                  <TabsTrigger value="minimalist" className="text-xs flex items-center gap-1.5">
                    <Layers className="size-3.5" />
                    Minimalist Exhibition
                  </TabsTrigger>
                  <TabsTrigger value="cinematic" className="text-xs flex items-center gap-1.5">
                    <Camera className="size-3.5" />
                    Cinematic Full-Bleed
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Content Toggles */}
            <div className="space-y-3 rounded-xl border bg-card/60 p-4 shadow-sm">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Display Options
              </Label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Toggle Title */}
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="toggle-title" className="text-xs cursor-pointer">
                    Photo Name / Title
                  </Label>
                  <Switch
                    id="toggle-title"
                    checked={showTitle}
                    onCheckedChange={setShowTitle}
                  />
                </div>

                {/* Toggle EXIF */}
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="toggle-exif" className="text-xs cursor-pointer">
                    Camera & Lens EXIF
                  </Label>
                  <Switch
                    id="toggle-exif"
                    checked={showExif}
                    onCheckedChange={setShowExif}
                  />
                </div>

                {/* Toggle QR Code */}
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="toggle-qr" className="text-xs cursor-pointer flex items-center gap-1">
                    <QrCode className="size-3.5" />
                    Scan QR Code
                  </Label>
                  <Switch
                    id="toggle-qr"
                    checked={showQrCode}
                    onCheckedChange={setShowQrCode}
                  />
                </div>

                {/* Toggle Date */}
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="toggle-date" className="text-xs cursor-pointer">
                    Date Captured
                  </Label>
                  <Switch
                    id="toggle-date"
                    checked={showDate}
                    onCheckedChange={setShowDate}
                  />
                </div>

                {/* Toggle Location */}
                <div className="flex items-center justify-between space-x-2">
                  <Label htmlFor="toggle-loc" className="text-xs cursor-pointer">
                    GPS Coordinates
                  </Label>
                  <Switch
                    id="toggle-loc"
                    checked={showLocation}
                    onCheckedChange={setShowLocation}
                  />
                </div>
              </div>
            </div>

            {/* Photographer Signature Input */}
            <div className="space-y-1.5">
              <Label htmlFor="photographer-name" className="text-xs font-medium">
                Photographer / Signature Credit
              </Label>
              <Input
                id="photographer-name"
                value={photographerName}
                onChange={(e) => setPhotographerName(e.target.value)}
                placeholder="e.g. Yan Saputra"
                className="h-9 text-sm"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-2">
              {/* Primary: Share to Instagram Stories */}
              <Button
                type="button"
                onClick={handleShareToInstagram}
                disabled={isGenerating || isSharing || !currentBlob}
                className="w-full h-11 text-sm font-semibold rounded-xl bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white shadow-lg shadow-pink-500/25 hover:opacity-90 transition-all cursor-pointer"
              >
                {isSharing ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Preparing Share...
                  </>
                ) : (
                  <>
                    <InstagramIcon className="size-4 mr-2" />
                    Share to Instagram Story
                  </>
                )}
              </Button>

              {/* Secondary Buttons Grid */}
              <div className="grid grid-cols-3 gap-2">
                {/* Download */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={isGenerating || !currentBlob}
                  className="h-9 text-xs flex items-center justify-center gap-1.5 rounded-lg"
                >
                  <Download className="size-3.5" />
                  Download
                </Button>

                {/* Copy Image */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyImage}
                  disabled={isGenerating || !currentBlob}
                  className="h-9 text-xs flex items-center justify-center gap-1.5 rounded-lg"
                >
                  {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy Image"}
                </Button>

                {/* Copy Link */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  className="h-9 text-xs flex items-center justify-center gap-1.5 rounded-lg"
                >
                  <Share2 className="size-3.5" />
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
