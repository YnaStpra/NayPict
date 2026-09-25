"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/app/provider";
import { UserTypeEnum } from "@/server/enums/user-enum";
import {
  storageCleanerScan,
  storageCleanerDeleteOrphans,
  storageCleanerAbortUploads,
  storageCleanerFixBroken,
} from "@/request/storage-cleaner";
import {
  type StorageScanReportVo,
  type StorageOrphanFileVo,
  type StorageIncompleteUploadVo,
  type StorageBrokenRecordVo,
} from "@/server/entity/vo/storage-cleaner";
import {
  Sparkles,
  RefreshCw,
  Trash2,
  HardDrive,
  FileQuestion,
  UploadCloud,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Search,
  Database,
  ArrowRight,
  Loader2,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 2)} ${units[i]}`;
}

export default function StorageCleanerPage() {
  const router = useRouter();
  const { userInfo, sidebarOpen, setSidebarOpen } = useApp();
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN;

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [report, setReport] = useState<StorageScanReportVo | null>(null);
  const [selectedStorageId, setSelectedStorageId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("orphans");
  const [searchTerm, setSearchTerm] = useState("");

  // Checkbox selections for batch operations
  const [selectedOrphanKeys, setSelectedOrphanKeys] = useState<Set<string>>(new Set());
  const [selectedUploadIds, setSelectedUploadIds] = useState<Set<string>>(new Set());
  const [selectedBrokenPhotoIds, setSelectedBrokenPhotoIds] = useState<Set<string>>(new Set());

  // Confirm modal state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    actionLabel: string;
    variant?: "destructive" | "default";
    onConfirm: () => void;
  }>({
    open: false,
    title: "",
    description: "",
    actionLabel: "Confirm",
    onConfirm: () => {},
  });

  const runScan = useCallback((storageId?: string) => {
    setLoading(true);
    storageCleanerScan(storageId === "all" ? undefined : storageId)
      .then((data) => {
        setReport(data);
        setSelectedOrphanKeys(new Set());
        setSelectedUploadIds(new Set());
        setSelectedBrokenPhotoIds(new Set());
        toast.success("Storage scan completed successfully!");
      })
      .catch((err) => {
        console.error("Storage scan failed:", err);
        toast.error("Failed to scan storage: " + (err.message || "Unknown error"));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (isAdmin) {
      runScan();
    } else if (userInfo) {
      router.replace("/login");
    }
  }, [isAdmin, userInfo, router, runScan]);

  // Filtered views based on selected storage bucket
  const activeStorages = useMemo(() => {
    if (!report?.storages) return [];
    if (selectedStorageId === "all") return report.storages;
    return report.storages.filter((s) => s.storageId === selectedStorageId);
  }, [report, selectedStorageId]);

  const allOrphans = useMemo(() => {
    const list: (StorageOrphanFileVo & { storageId: string; storageName: string })[] = [];
    for (const s of activeStorages) {
      for (const o of s.orphanFiles) {
        list.push({ ...o, storageId: s.storageId, storageName: s.storageName });
      }
    }
    return list;
  }, [activeStorages]);

  const filteredOrphans = useMemo(() => {
    if (!searchTerm.trim()) return allOrphans;
    const term = searchTerm.toLowerCase();
    return allOrphans.filter((o) => o.key.toLowerCase().includes(term));
  }, [allOrphans, searchTerm]);

  const allIncompleteUploads = useMemo(() => {
    const list: (StorageIncompleteUploadVo & { storageId: string; storageName: string })[] = [];
    for (const s of activeStorages) {
      for (const u of s.incompleteUploads) {
        list.push({ ...u, storageId: s.storageId, storageName: s.storageName });
      }
    }
    return list;
  }, [activeStorages]);

  const allBrokenRecords = useMemo(() => {
    const list: (StorageBrokenRecordVo & { storageId: string; storageName: string })[] = [];
    for (const s of activeStorages) {
      for (const b of s.brokenRecords) {
        list.push({ ...b, storageId: s.storageId, storageName: s.storageName });
      }
    }
    return list;
  }, [activeStorages]);

  const totalBucketSize = useMemo(() => {
    return activeStorages.reduce((acc, s) => acc + s.totalBucketBytes, 0);
  }, [activeStorages]);

  const totalBucketObjects = useMemo(() => {
    return activeStorages.reduce((acc, s) => acc + s.totalBucketObjects, 0);
  }, [activeStorages]);

  const totalOrphanSize = useMemo(() => {
    return activeStorages.reduce((acc, s) => acc + s.orphanTotalBytes, 0);
  }, [activeStorages]);

  // Handlers for deletions
  const handleDeleteOrphans = (keysToDelete: string[]) => {
    if (!keysToDelete.length) return;

    // Group keys by storageId
    const storageMap = new Map<string, string[]>();
    for (const k of keysToDelete) {
      const item = allOrphans.find((o) => o.key === k);
      if (item) {
        const arr = storageMap.get(item.storageId) || [];
        arr.push(k);
        storageMap.set(item.storageId, arr);
      }
    }

    setConfirmDialog({
      open: true,
      title: `Delete ${keysToDelete.length} Orphan File(s)?`,
      description: `This will permanently delete ${keysToDelete.length} unreferenced file(s) from your Cloudflare R2 bucket. Your gallery and published media will NOT be affected because these files have no records in the database.`,
      actionLabel: "Permanently Delete",
      variant: "destructive",
      onConfirm: async () => {
        setActionLoading(true);
        try {
          let totalDeleted = 0;
          for (const [stId, keys] of storageMap.entries()) {
            const res = await storageCleanerDeleteOrphans({ storageId: stId, keys });
            totalDeleted += res.deleted;
          }
          toast.success(`Successfully deleted ${totalDeleted} orphan file(s) from storage.`);
          runScan(selectedStorageId);
        } catch (err: any) {
          toast.error("Failed to delete orphan files: " + (err.message || "Unknown error"));
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleAbortUploads = (uploadIdsToAbort: string[]) => {
    if (!uploadIdsToAbort.length) return;

    const uploadsList: { storageId: string; upload: { key: string; uploadId: string } }[] = [];
    for (const id of uploadIdsToAbort) {
      const item = allIncompleteUploads.find((u) => u.uploadId === id);
      if (item) {
        uploadsList.push({ storageId: item.storageId, upload: { key: item.key, uploadId: item.uploadId } });
      }
    }

    setConfirmDialog({
      open: true,
      title: `Abort ${uploadIdsToAbort.length} Incomplete Upload(s)?`,
      description: "This will abort and discard pending multipart chunk uploads from Cloudflare R2, releasing any stranded storage resources.",
      actionLabel: "Abort Uploads",
      variant: "destructive",
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const map = new Map<string, { key: string; uploadId: string }[]>();
          for (const item of uploadsList) {
            const arr = map.get(item.storageId) || [];
            arr.push(item.upload);
            map.set(item.storageId, arr);
          }
          let totalAborted = 0;
          for (const [stId, uploads] of map.entries()) {
            const res = await storageCleanerAbortUploads({ storageId: stId, uploads });
            totalAborted += res.aborted;
          }
          toast.success(`Successfully aborted ${totalAborted} incomplete upload(s).`);
          runScan(selectedStorageId);
        } catch (err: any) {
          toast.error("Failed to abort uploads: " + (err.message || "Unknown error"));
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleFixBroken = (photoIdsToFix: string[]) => {
    if (!photoIdsToFix.length) return;

    setConfirmDialog({
      open: true,
      title: `Purge ${photoIdsToFix.length} Broken Record(s)?`,
      description: "These photos have database entries but their media files are completely missing from Cloudflare R2 (resulting in broken images/videos). Purging will remove these ghost entries from your database.",
      actionLabel: "Purge Broken Records",
      variant: "destructive",
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const res = await storageCleanerFixBroken({ photoIds: photoIdsToFix });
          toast.success(`Successfully purged ${res.fixed} broken record(s).`);
          runScan(selectedStorageId);
        } catch (err: any) {
          toast.error("Failed to purge broken records: " + (err.message || "Unknown error"));
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  if (!userInfo || !isAdmin) {
    return null;
  }

  const isHealthy = allOrphans.length === 0 && allIncompleteUploads.length === 0 && allBrokenRecords.length === 0;

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 bg-background/95 backdrop-blur-md px-4 border-b">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admin">Admin Portal</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="font-semibold flex items-center gap-1.5">
                    <Sparkles className="size-4 text-pink-500" />
                    <span>Storage Cleaner</span>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => runScan(selectedStorageId)}
              disabled={loading || actionLoading}
              className="gap-2 text-xs h-8"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
              <span>{loading ? "Scanning..." : "Rescan Buckets"}</span>
            </Button>
          </div>
        </header>

        {/* Content Body */}
        <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
          {/* Hero Banner */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-pink-500/10 via-purple-500/5 to-transparent p-6 border border-pink-500/20 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/15 text-pink-600 dark:text-pink-400 text-xs font-semibold">
                  <Sparkles className="size-3.5" />
                  Cloudflare R2 Health & Integrity Tool
                </div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                  Storage Cleaner & Media Diagnostic
                </h1>
                <p className="text-muted-foreground text-sm max-w-2xl">
                  Deeply scan your Cloudflare R2 storage buckets to detect orphan files, incomplete video uploads, and broken ghost records. Safely reclaim storage capacity with zero impact on live gallery items.
                </p>
              </div>

              {/* Bucket Selector Dropdown */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-background/80 backdrop-blur border rounded-xl px-3 py-1.5 shadow-sm">
                  <Database className="size-4 text-muted-foreground" />
                  <select
                    value={selectedStorageId}
                    onChange={(e) => {
                      setSelectedStorageId(e.target.value);
                      runScan(e.target.value);
                    }}
                    className="bg-transparent text-xs font-medium focus:outline-none cursor-pointer text-foreground pr-2"
                  >
                    <option value="all">All Storage Buckets ({report?.storages.length || 0})</option>
                    {report?.storages.map((s) => (
                      <option key={s.storageId} value={s.storageId}>
                        {s.storageName} ({s.bucket})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Health Status Banner */}
          {!loading && report && (
            <div
              className={`rounded-xl p-4 border flex items-center justify-between gap-4 transition-all ${
                isHealthy
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300"
              }`}
            >
              <div className="flex items-center gap-3">
                {isHealthy ? (
                  <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="size-5 text-amber-500 shrink-0" />
                )}
                <div>
                  <h4 className="font-semibold text-sm">
                    {isHealthy
                      ? "Storage Status: 100% Clean & Synchronized"
                      : "Unreferenced Storage Found"}
                  </h4>
                  <p className="text-xs opacity-90 mt-0.5">
                    {isHealthy
                      ? "Every media file in Cloudflare R2 matches valid database records. No wasted storage or broken links detected."
                      : `Found ${allOrphans.length} orphan file(s) (${formatBytes(totalOrphanSize)}), ${allIncompleteUploads.length} incomplete upload(s), and ${allBrokenRecords.length} broken record(s).`}
                  </p>
                </div>
              </div>

              {!isHealthy && allOrphans.length > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-2 shrink-0 text-xs shadow-sm"
                  onClick={() => handleDeleteOrphans(allOrphans.map((o) => o.key))}
                  disabled={actionLoading}
                >
                  <Trash2 className="size-3.5" />
                  <span>Clean All ({formatBytes(totalOrphanSize)})</span>
                </Button>
              )}
            </div>
          )}

          {/* 4 Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Bucket Storage */}
            <Card className="border border-border/60 shadow-sm relative overflow-hidden">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <CardDescription className="text-xs font-medium">Bucket Storage</CardDescription>
                <div className="size-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <HardDrive className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {loading ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : formatBytes(totalBucketSize)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {loading ? "Counting..." : `${totalBucketObjects.toLocaleString()} total objects in R2`}
                </p>
              </CardContent>
            </Card>

            {/* Card 2: Orphan Files */}
            <Card className={`border shadow-sm relative overflow-hidden ${allOrphans.length > 0 ? "border-amber-500/40 bg-amber-500/[0.02]" : "border-border/60"}`}>
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <CardDescription className="text-xs font-medium">Orphan Files</CardDescription>
                <div className={`size-8 rounded-lg flex items-center justify-center ${allOrphans.length > 0 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-500"}`}>
                  <FileQuestion className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  {loading ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : allOrphans.length}
                  {!loading && allOrphans.length > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                      {formatBytes(totalOrphanSize)}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {allOrphans.length > 0 ? "Unused files taking R2 space" : "No orphan files in bucket"}
                </p>
              </CardContent>
            </Card>

            {/* Card 3: Incomplete Uploads */}
            <Card className={`border shadow-sm relative overflow-hidden ${allIncompleteUploads.length > 0 ? "border-orange-500/40" : "border-border/60"}`}>
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <CardDescription className="text-xs font-medium">Incomplete Uploads</CardDescription>
                <div className={`size-8 rounded-lg flex items-center justify-center ${allIncompleteUploads.length > 0 ? "bg-orange-500/15 text-orange-500" : "bg-muted text-muted-foreground"}`}>
                  <UploadCloud className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {loading ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : allIncompleteUploads.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {allIncompleteUploads.length > 0 ? "Stuck multipart uploads" : "Zero abandoned chunks"}
                </p>
              </CardContent>
            </Card>

            {/* Card 4: Broken Records */}
            <Card className={`border shadow-sm relative overflow-hidden ${allBrokenRecords.length > 0 ? "border-rose-500/40 bg-rose-500/[0.02]" : "border-border/60"}`}>
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <CardDescription className="text-xs font-medium">Broken Media Records</CardDescription>
                <div className={`size-8 rounded-lg flex items-center justify-center ${allBrokenRecords.length > 0 ? "bg-rose-500/15 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                  <AlertTriangle className="size-4" />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {loading ? <Loader2 className="size-6 animate-spin text-muted-foreground" /> : allBrokenRecords.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {allBrokenRecords.length > 0 ? "DB records missing R2 files" : "All records healthy"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Tabs Container */}
          <Card className="border border-border/60 shadow-sm overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="border-b px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
                <TabsList className="bg-muted/60 p-1">
                  <TabsTrigger value="orphans" className="text-xs gap-1.5">
                    <FileQuestion className="size-3.5" />
                    <span>Orphan Files</span>
                    {allOrphans.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-semibold">
                        {allOrphans.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="incomplete" className="text-xs gap-1.5">
                    <UploadCloud className="size-3.5" />
                    <span>Incomplete Uploads</span>
                    {allIncompleteUploads.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-orange-500 text-white font-semibold">
                        {allIncompleteUploads.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="broken" className="text-xs gap-1.5">
                    <AlertTriangle className="size-3.5" />
                    <span>Broken Records</span>
                    {allBrokenRecords.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-semibold">
                        {allBrokenRecords.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="overview" className="text-xs gap-1.5">
                    <Database className="size-3.5" />
                    <span>Bucket Overview</span>
                  </TabsTrigger>
                </TabsList>

                {/* Search bar (when in orphans tab) */}
                {activeTab === "orphans" && (
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search orphan keys..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 h-8 text-xs bg-background"
                    />
                  </div>
                )}
              </div>

              {/* TAB 1: Orphan Files */}
              <TabsContent value="orphans" className="m-0 p-0">
                {allOrphans.length > 0 && (
                  <div className="px-4 py-2.5 bg-muted/40 border-b flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={
                          selectedOrphanKeys.size === filteredOrphans.length &&
                          filteredOrphans.length > 0
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedOrphanKeys(new Set(filteredOrphans.map((o) => o.key)));
                          } else {
                            setSelectedOrphanKeys(new Set());
                          }
                        }}
                        id="select-all-orphans"
                      />
                      <label htmlFor="select-all-orphans" className="font-medium cursor-pointer text-foreground">
                        {selectedOrphanKeys.size > 0
                          ? `${selectedOrphanKeys.size} of ${filteredOrphans.length} selected`
                          : `Select all (${filteredOrphans.length})`}
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedOrphanKeys.size > 0 && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => handleDeleteOrphans(Array.from(selectedOrphanKeys))}
                          disabled={actionLoading}
                        >
                          <Trash2 className="size-3" />
                          <span>Delete Selected ({selectedOrphanKeys.size})</span>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                        onClick={() => handleDeleteOrphans(allOrphans.map((o) => o.key))}
                        disabled={actionLoading}
                      >
                        <Trash2 className="size-3" />
                        <span>Delete All ({allOrphans.length})</span>
                      </Button>
                    </div>
                  </div>
                )}

                {filteredOrphans.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <div className="size-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="size-6" />
                    </div>
                    <h3 className="font-semibold text-base text-foreground">No Orphan Files Found</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      All files in Cloudflare R2 are correctly referenced by photos in your database. No unlinked storage waste detected.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/30 text-muted-foreground font-medium border-b">
                        <tr>
                          <th className="py-3 px-4 w-10"></th>
                          <th className="py-3 px-4">Storage Key / Path</th>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4">Bucket</th>
                          <th className="py-3 px-4">Size</th>
                          <th className="py-3 px-4">Last Modified</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {filteredOrphans.map((item) => (
                          <tr key={item.key} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-4">
                              <Checkbox
                                checked={selectedOrphanKeys.has(item.key)}
                                onCheckedChange={(checked) => {
                                  setSelectedOrphanKeys((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(item.key);
                                    else next.delete(item.key);
                                    return next;
                                  });
                                }}
                              />
                            </td>
                            <td className="py-3 px-4 font-mono font-medium text-foreground max-w-md truncate" title={item.key}>
                              {item.key}
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant="outline"
                                className={`text-[10px] uppercase font-semibold ${
                                  item.probableType === "original"
                                    ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                                    : item.probableType === "preview"
                                    ? "bg-purple-500/10 text-purple-600 border-purple-500/30"
                                    : item.probableType === "thumbnail"
                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {item.probableType}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">{item.storageName}</td>
                            <td className="py-3 px-4 font-semibold text-foreground">{formatBytes(item.size)}</td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {item.lastModified ? new Date(item.lastModified).toLocaleDateString() : "—"}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteOrphans([item.key])}
                                className="h-7 px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* TAB 2: Incomplete Uploads */}
              <TabsContent value="incomplete" className="m-0 p-0">
                {allIncompleteUploads.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <div className="size-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="size-6" />
                    </div>
                    <h3 className="font-semibold text-base text-foreground">No Incomplete Uploads</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      There are no abandoned or stalled multipart upload sessions in your Cloudflare R2 bucket.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted/40 border-b flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {allIncompleteUploads.length} stalled multipart upload session(s)
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={() => handleAbortUploads(allIncompleteUploads.map((u) => u.uploadId))}
                        disabled={actionLoading}
                      >
                        <Trash2 className="size-3.5" />
                        <span>Abort All ({allIncompleteUploads.length})</span>
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/30 text-muted-foreground font-medium border-b">
                          <tr>
                            <th className="py-3 px-4">Upload Key</th>
                            <th className="py-3 px-4">Upload ID</th>
                            <th className="py-3 px-4">Storage Bucket</th>
                            <th className="py-3 px-4">Initiated</th>
                            <th className="py-3 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {allIncompleteUploads.map((u) => (
                            <tr key={u.uploadId} className="hover:bg-muted/30 transition-colors">
                              <td className="py-3 px-4 font-mono font-medium text-foreground">{u.key}</td>
                              <td className="py-3 px-4 font-mono text-muted-foreground">{u.uploadId}</td>
                              <td className="py-3 px-4">{u.storageName}</td>
                              <td className="py-3 px-4 text-muted-foreground">
                                {u.initiated ? new Date(u.initiated).toLocaleString() : "—"}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleAbortUploads([u.uploadId])}
                                  className="h-7 text-xs"
                                >
                                  Abort
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* TAB 3: Broken Records */}
              <TabsContent value="broken" className="m-0 p-0">
                {allBrokenRecords.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <div className="size-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="size-6" />
                    </div>
                    <h3 className="font-semibold text-base text-foreground">No Broken Records Found</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      All media entries in your database exist physically on Cloudflare R2 with valid positive file sizes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-rose-500/10 border-b flex items-center justify-between">
                      <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">
                        Found {allBrokenRecords.length} database item(s) missing from Cloudflare R2
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={() => handleFixBroken(Array.from(new Set(allBrokenRecords.map((b) => b.photoId))))}
                        disabled={actionLoading}
                      >
                        <Trash2 className="size-3.5" />
                        <span>Purge All Broken Records</span>
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/30 text-muted-foreground font-medium border-b">
                          <tr>
                            <th className="py-3 px-4">Photo Name</th>
                            <th className="py-3 px-4">Expected Storage Key</th>
                            <th className="py-3 px-4">Storage Bucket</th>
                            <th className="py-3 px-4">Issue</th>
                            <th className="py-3 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {allBrokenRecords.map((b) => (
                            <tr key={b.fileId} className="hover:bg-muted/30 transition-colors">
                              <td className="py-3 px-4 font-semibold text-foreground">{b.name}</td>
                              <td className="py-3 px-4 font-mono text-muted-foreground">{b.key}</td>
                              <td className="py-3 px-4">{b.storageName}</td>
                              <td className="py-3 px-4">
                                <Badge variant="destructive" className="text-[10px]">
                                  {b.reason === "missing_in_r2" ? "404 Not Found in R2" : "0 Bytes (Empty)"}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleFixBroken([b.photoId])}
                                  className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                >
                                  Purge
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* TAB 4: Bucket Overview */}
              <TabsContent value="overview" className="m-0 p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeStorages.map((s) => (
                    <div
                      key={s.storageId}
                      className="rounded-xl border p-5 bg-card/60 space-y-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Database className="size-4 text-primary" />
                            <h3 className="font-bold text-base text-foreground">{s.storageName}</h3>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                            bucket: {s.bucket}
                          </p>
                        </div>
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">
                          Active R2
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-lg bg-muted/40">
                          <span className="text-muted-foreground block text-[11px]">Total Objects</span>
                          <span className="text-base font-bold text-foreground">
                            {s.totalBucketObjects.toLocaleString()}
                          </span>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/40">
                          <span className="text-muted-foreground block text-[11px]">Storage Used</span>
                          <span className="text-base font-bold text-foreground">
                            {formatBytes(s.totalBucketBytes)}
                          </span>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/40">
                          <span className="text-muted-foreground block text-[11px]">Database Records</span>
                          <span className="text-base font-bold text-foreground">
                            {s.totalDbFiles.toLocaleString()}
                          </span>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/40">
                          <span className="text-muted-foreground block text-[11px]">Orphan Objects</span>
                          <span className={`text-base font-bold ${s.orphanFiles.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-500"}`}>
                            {s.orphanFiles.length} ({formatBytes(s.orphanTotalBytes)})
                          </span>
                        </div>
                      </div>

                      {s.endpoint && (
                        <div className="text-[11px] text-muted-foreground truncate font-mono">
                          endpoint: {s.endpoint}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* Global Confirmation Dialog */}
        <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDialog.onConfirm}
                disabled={actionLoading}
                className={confirmDialog.variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              >
                {actionLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                {confirmDialog.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
