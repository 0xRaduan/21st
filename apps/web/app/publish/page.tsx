"use client"

import React, { useEffect } from "react"
import { useUser, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import ComponentForm from "@/components/ComponentForm/ComponentForm"
import { LoadingSpinner } from "@/components/Loading"
import { Header } from "@/components/Header"
import Head from "next/head"

export default function PublishPage() {
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in?redirect_url=/publish")
    }
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded) {
    return <LoadingSpinner />
  }

  return (
    <>
      <Head>
        <title>Publish New Component | Component Library</title>
      </Head>
      <SignedIn>
        <div className="flex flex-col items-center gap-7 h-screen w-full">
          <ComponentForm />
        </div>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  )
}
