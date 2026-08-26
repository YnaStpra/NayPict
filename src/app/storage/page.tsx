'use client';

import { useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AlertDialogDestructive } from "@/components/common/alert-destructive"
import { StorageAddDialog } from "@/components/storage/storage-add-dialog"
import { DataTable } from "@/components/storage/storage-data-table"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { storageAdd, storageDelete, storageList, storageSet, storageSetTop, storageToggleStatus } from "@/request/storage"
import { type Storage, type StorageInto } from "@/server/entity/storage"
import { useStorageColumns } from "@/components/storage/storage-columns";
import { type StorageVo } from "@/server/entity/vo/storage";
import { useStorageContext } from "@/app/storage/provider"
import { useApp } from "@/app/provider"
import { useTranslations } from "next-intl"

export default function Page() {
  const t = useTranslations("storage")
  const { initialStorageList } = useStorageContext()
  const { sidebarOpen, setSidebarOpen, refreshStorages } = useApp()
  // data Save the storage configuration list displayed in the current table.
  const [data, setData] = useState<StorageVo[]>(initialStorageList)
  // addOpen Control the opening state of the new storage pop-up box.
  const [addOpen, setAddOpen] = useState(false)
  // editOpen Control the open state of the modified storage pop-up box.
  const [editOpen, setEditOpen] = useState(false)
  // editingStorage Save the storage configuration currently being modified.
  const [editingStorage, setEditingStorage] = useState<StorageVo | null>(null)
  // deleteOpen Control the opening state of the delete confirmation pop-up box.
  const [deleteOpen, setDeleteOpen] = useState(false)
  // deletingStorage Save the storage configuration currently awaiting deletion confirmation.
  const [deletingStorage, setDeletingStorage] = useState<StorageVo | null>(null)

  // Query a stored list and bind to tabular data.
  async function getStorageList() {
    const res = await storageList()

    setData(res.list)
  }

  // Requery table and global storage dropdown options.
  async function refreshStorageData() {
    await getStorageList()
    await refreshStorages()
  }

  // Open the new storage pop-up box.
  function openAddStorage() {
    setAddOpen(true)
  }

  // Add storage configuration.
  function addStorage(storage: StorageInto) {
    storageAdd(storage).then(() => {
      void refreshStorageData()
    })
  }

  // Open the delete confirmation popup.
  function openDeleteStorage(storage: StorageVo) {
    setDeletingStorage(storage)
    setDeleteOpen(true)
  }

  // Confirm to delete the storage configuration and query the list again..
  function confirmDeleteStorage() {
    const storage = deletingStorage

    if (!storage) {
      return
    }

    setDeleteOpen(false)
    setTimeout(() => {
      setDeletingStorage(null)
    }, 300)

    storageDelete(storage.storageId).then(() => {
      void refreshStorageData()
    })
  }

  // Open the modify storage pop-up box.
  function openEditStorage(storage: StorageVo) {
    setEditingStorage(storage)
    setEditOpen(true)
  }

  // Submit modified storage configuration, Refresh list after success.
  function editStorage(storage: StorageInto) {
    if (!editingStorage) {
      return
    }

    const nextStorage: Storage = {
      storageId: editingStorage.storageId,
      name: storage.name,
      type: storage.type,
      domain: storage.domain ?? null,
      bucket: storage.bucket ?? null,
      region: storage.region ?? null,
      endpoint: storage.endpoint ?? null,
      accessKey: storage.accessKey ?? null,
      secretKey: storage.secretKey ?? null,
      userId: editingStorage.userId,
      sort: editingStorage.sort,
      status: storage.status ?? editingStorage.status,
    }

    storageSet(nextStorage).then(() => {
      toast.success(t("updated"))
      void refreshStorageData()
    })
  }

  // Refresh the list after the top storage configuration.
  function setTopStorage(storageId: string) {
    storageSetTop({ storageId }).then(() => {
      void refreshStorageData()
    })
  }

  // Refresh the list after switching storage enabled status.
  function toggleStorageStatus(storageId: string) {
    storageToggleStatus({ storageId }).then(() => {
      void refreshStorageData()
    })
  }

  // Processing and modifying the open state of the storage pop-up box.
  function handleEditOpenChange(open: boolean) {
    setEditOpen(open)

    if (!open) {
      setEditingStorage(null)
    }
  }

  // Handling the open state of the deletion confirmation pop-up box.
  function handleDeleteOpenChange(open: boolean) {
    setDeleteOpen(open)

    if (!open) {
      setTimeout(() => {
        setDeletingStorage(null)
      }, 300)
    }
  }

  const columns = useStorageColumns({
    onEdit: openEditStorage,
    onSetTop: setTopStorage,
    onToggleStatus: toggleStorageStatus,
    onDelete: openDeleteStorage
  })

  return (
    <>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          <header
            className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 bg-background/95 backdrop-blur-md border-b transition-[width,height] ease-linear">
            <div className="flex min-w-0 items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-vertical:h-4 data-vertical:self-auto"
              />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage>{t("title")}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </header>
          <div className="space-y-3 px-4 py-4" >
            <DataTable
              columns={columns}
              data={data}
              action={
                <Button type="button" onClick={openAddStorage}>
                  <Plus />
                  {t("add")}
                </Button>
              }
            ></DataTable>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <StorageAddDialog
        title={t("addTitle")}
        open={addOpen}
        onOpenChange={setAddOpen}
        onStorageConfirm={addStorage}
      />
      {editingStorage && (
        <StorageAddDialog
          title={t("editTitle")}
          open={editOpen}
          storage={editingStorage}
          onOpenChange={handleEditOpenChange}
          onStorageConfirm={editStorage}
        />
      )}
      <AlertDialogDestructive
        open={deleteOpen}
        onOpenChange={handleDeleteOpenChange}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
        onConfirm={confirmDeleteStorage}
      />
    </>
  )
}
