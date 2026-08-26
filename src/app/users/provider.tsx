"use client"

import { createContext, useContext } from "react"

import { type UserVo } from "@/server/entity/vo/user"

interface UserContextValue {
  // initialUserList Save the user list queried by the server.
  initialUserList: UserVo[]
}

interface UserProviderProps {
  // children yes /user Page content under routing.
  children: React.ReactNode
  // initialUserList Save the user list queried by the server.
  initialUserList: UserVo[]
}

const UserContext = createContext<UserContextValue | null>(null)

// read /user User list prefetched by the server under routing.
function useUserContext() {
  const context = useContext(UserContext)

  if (!context) {
    throw new Error("useUserContext must be used within UserProvider.")
  }

  return context
}

// Give /user The client component under routing provides server-side prefetching of the user list.
function UserProvider({ children, initialUserList }: UserProviderProps) {
  return (
    <UserContext.Provider value={{ initialUserList }}>
      {children}
    </UserContext.Provider>
  )
}

export { UserProvider, useUserContext }
