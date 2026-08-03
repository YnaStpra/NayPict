'use client';

import { useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AlertDialogDestructive } from "@/components/common/alert-destructive"
import { UserAddDialog } from "@/components/user/user-add-dialog"
import { DataTable } from "@/components/user/user-data-table"
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
import { userAdd, userDelete, userList, userSet, userToggleStatus } from "@/request/user"
import { type UserAddBo, type UserSetBo } from "@/server/entity/bo/user"
import { type UserVo } from "@/server/entity/vo/user"
import { useUserColumns } from "@/components/user/user-columns"
import { useUserContext } from "@/app/users/provider"
import { useApp } from "@/app/provider"
import { useTranslations } from "next-intl"

export default function Page() {
  const t = useTranslations("users")
  const { initialUserList } = useUserContext()
  const { sidebarOpen, setSidebarOpen } = useApp()
  // data Save the user list displayed in the current table。
  const [data, setData] = useState<UserVo[]>(initialUserList)
  // addOpen Control the opening status of the new user pop-up box。
  const [addOpen, setAddOpen] = useState(false)
  // editOpen Control the opening state of the edit user pop-up box。
  const [editOpen, setEditOpen] = useState(false)
  // editingUser Save the user currently editing。
  const [editingUser, setEditingUser] = useState<UserVo | null>(null)
  // deleteOpen Control the opening state of the delete confirmation pop-up box。
  const [deleteOpen, setDeleteOpen] = useState(false)
  // deletingUser Save users currently awaiting deletion confirmation。
  const [deletingUser, setDeletingUser] = useState<UserVo | null>(null)

  // Open the add user pop-up box。
  function openAddUser() {
    setAddOpen(true)
  }

  // Query user list and bind to table data。
  function getUserList() {
    userList().then((res) => {
      setData(res.list)
    })
  }

  // Add user。
  function addUser(user: UserAddBo) {
    userAdd(user).then(() => {
      getUserList()
    })
  }

  // Open the edit user popup box。
  function openEditUser(user: UserVo) {
    setEditingUser(user)
    setEditOpen(true)
  }

  // Submit modified user information。
  function editUser(user: UserSetBo) {
    userSet(user).then(() => {
      toast.success(t("updated"))
      getUserList()
    })
  }

  // Refresh the list after switching user enabled status。
  function toggleUserStatus(userId: string) {
    userToggleStatus({ userId }).then(() => {
      getUserList()
    })
  }

  // Open the delete confirmation popup。
  function openDeleteUser(user: UserVo) {
    setDeletingUser(user)
    setDeleteOpen(true)
  }

  // Refresh the list after confirming the deletion of the user。
  function confirmDeleteUser() {
    const user = deletingUser

    if (!user) {
      return
    }

    setDeleteOpen(false)
    setTimeout(() => {
      setDeletingUser(null)
    }, 300)

    userDelete(user.userId).then(() => {
      getUserList()
    })
  }

  // Handle the open state of the edit user pop-up box。
  function handleEditOpenChange(open: boolean) {
    setEditOpen(open)

    if (!open) {
      setTimeout(() => {
        setEditingUser(null)
      }, 300)
    }
  }

  // Handling the open state of the deletion confirmation pop-up box。
  function handleDeleteOpenChange(open: boolean) {
    setDeleteOpen(open)

    if (!open) {
      setTimeout(() => {
        setDeletingUser(null)
      }, 300)
    }
  }

  const columns = useUserColumns({
    onEdit: openEditUser,
    onToggleStatus: toggleUserStatus,
    onDelete: openDeleteUser,
  })

  return (
    <>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarInset>
          <header
            className="flex h-13 shrink-0 items-center justify-between gap-2 bg-background transition-[width,height] ease-linear">
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
          <div className="space-y-3 px-4 py-4">
            <DataTable
              columns={columns}
              data={data}
              action={
                <Button type="button" onClick={openAddUser}>
                  <Plus />
                  {t("add")}
                </Button>
              }
            ></DataTable>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <UserAddDialog
        title={t("addTitle")}
        open={addOpen}
        onOpenChange={setAddOpen}
        onUserConfirm={(user) => addUser(user as UserAddBo)}
      />
      <UserAddDialog
        title={t("editTitle")}
        open={editOpen}
        user={editingUser}
        onOpenChange={handleEditOpenChange}
        onUserConfirm={(user) => editUser(user as UserSetBo)}
      />
      <AlertDialogDestructive
        open={deleteOpen}
        onOpenChange={handleDeleteOpenChange}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
        onConfirm={confirmDeleteUser}
      />
    </>
  )
}
