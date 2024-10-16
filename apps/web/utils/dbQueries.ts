import { Component, Tag, User } from "@/types/global"
import {
  UseMutationResult,
  useMutation,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query"
import { generateSlug } from "@/components/ComponentForm/useIsCheckSlugAvailable"
import { SupabaseClient } from "@supabase/supabase-js"
import { useClerkSupabaseClient } from "./clerk"
import { Database } from "@/types/supabase"

const componentFields = `
  *,
  user:users!user_id (*)
`

export async function getComponent(
  supabase: SupabaseClient<Database>,
  username: string,
  slug: string,
) {
  const { data, error } = await supabase
    .from("components")
    .select(
      `
      ${componentFields},
      tags:component_tags(tags(name, slug))
    `,
    )
    .eq("component_slug", slug)
    .eq("user.username", username)
    .eq("is_public", true)
    .returns<(Component & { user: User } & { tags: Tag[] })[]>()
    .single()

  if (error) {
    console.error("Error fetching component:", error)
    return { data: null, error: new Error(error.message) }
  }

  if (data && data.tags) {
    data.tags = data.tags.map((tag: any) => tag.tags)
  }

  return { data, error }
}

export async function getUserData(
  supabase: SupabaseClient<Database>,
  username: string,
): Promise<{ data: User | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single()

    if (error) {
      console.error("Error fetching user data:", error)
      return { data: null, error: new Error(error.message) }
    }

    return { data, error: null }
  } catch (error: any) {
    console.error("Error in getUserData:", error)
    return { data: null, error }
  }
}

export async function getUserComponents(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("components")
    .select(componentFields)
    .eq("user_id", userId)
    .eq("is_public", true)
    .returns<(Component & { user: User })[]>()

  if (error) {
    console.error("Error fetching user components:", error)
    return null
  }

  return data
}

export async function getComponents(
  supabase: SupabaseClient<Database>,
  tagSlug?: string,
) {
  let query = supabase
    .from("components")
    .select(
      `
    *,
    user:users!user_id (*),
    component_tags!inner (
      tags!inner (
        slug
      )
    )
  `,
    )
    .eq("is_public", true)

  if (tagSlug) {
    query = query.eq("component_tags.tags.slug", tagSlug)
  }

  const { data, error } = await query
    .limit(1000)
    .returns<(Component & { user: User } & { tags: Tag[] })[]>()

  if (error) {
    throw new Error(error.message)
  }
  return data as (Component & { user: User } & { tags: Tag[] })[]
}

export function useComponents(supabase: SupabaseClient<Database>, tagSlug?: string) {
  return useQuery({
    queryKey: ["components", tagSlug],
    queryFn: () => getComponents(supabase, tagSlug),
    refetchOnWindowFocus: false,
    retry: false,
  })
}

export async function getComponentTags(
  componentId: string,
): Promise<Tag[] | null> {
  const supabase = useClerkSupabaseClient()
  const { data, error } = await supabase
    .from("component_tags")
    .select("tags(name, slug)")
    .eq("component_id", componentId)

  if (error) {
    console.error("Error fetching component tags:", error)
    return null
  }

  return data.map((item: any) => item.tags)
}

export function useComponentTags(componentId: string) {
  return useQuery<Tag[] | null, Error>({
    queryKey: ["componentTags", componentId],
    queryFn: () => getComponentTags(componentId),
  })
}

export async function likeComponent(
  supabase: SupabaseClient<Database>,
  userId: string,
  componentId: number,
) {
  const { error } = await supabase.from("component_likes").insert({
    user_id: userId,
    component_id: componentId,
  })

  if (error) {
    console.error("Error liking component:", error)
    throw error
  }
}

export async function unlikeComponent(
  supabase: SupabaseClient<Database>,
  userId: string,
  componentId: number,
) {
  const { error } = await supabase
    .from("component_likes")
    .delete()
    .eq("user_id", userId)
    .eq("component_id", componentId)

  if (error) {
    console.error("Error unliking component:", error)
    throw error
  }
}

export function useLikeMutation(
  supabase: SupabaseClient<Database>,
  userId: string | undefined,
): UseMutationResult<void, Error, { componentId: number; liked: boolean }> {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { componentId: number; liked: boolean }>({
    mutationFn: async ({
      componentId,
      liked,
    }: {
      componentId: number
      liked: boolean
    }) => {
      if (!userId) {
        throw new Error("User is not logged in")
      }
      if (liked) {
        await unlikeComponent(supabase, userId, componentId)
      } else {
        await likeComponent(supabase, userId, componentId)
      }
    },
    onSuccess: (_, { componentId }) => {
      queryClient.invalidateQueries({
        queryKey: ["hasUserLikedComponent", componentId, userId],
      })
      queryClient.invalidateQueries({
        queryKey: ["component", componentId],
      })
      queryClient.invalidateQueries({
        queryKey: ["components"],
      })
    },
  })
}

export async function addTagsToComponent(
  supabase: SupabaseClient<Database>,
  componentId: number,
  tags: Tag[],
) {
  for (const tag of tags) {
    let tagId: number

    if (tag.id) {
      tagId = tag.id
    } else {
      const capitalizedName =
        tag.name.charAt(0).toUpperCase() + tag.name.slice(1)
      const slug = generateSlug(tag.name)
      const { data: existingTag, error: selectError } = await supabase
        .from("tags")
        .select("id")
        .eq("slug", slug)
        .single()

      if (existingTag) {
        tagId = existingTag.id
      } else {
        const { data: newTag, error: insertError } = await supabase
          .from("tags")
          .insert({ name: capitalizedName, slug })
          .single()

        if (insertError) {
          console.error("Error inserting tag:", insertError)
          continue
        }
        if (newTag && typeof newTag === "object" && "id" in newTag) {
          tagId = (newTag as { id: number }).id
        } else {
          console.error("New tag was not created or does not have an id")
          continue
        }
      }
    }

    const { error: linkError } = await supabase
      .from("component_tags")
      .insert({ component_id: componentId, tag_id: tagId })

    if (linkError) {
      console.error("Error linking tag to component:", linkError)
    }
  }
}

export function useAvailableTags() {
  async function getAvailableTags(supabase: SupabaseClient<Database>): Promise<Tag[]> {
    const { data, error } = await supabase
      .from("tags")
      .select("*")
      .order("name")

    if (error) {
      console.error("Error loading tags:", error)
      return []
    }

    return data || []
  }

  const supabase = useClerkSupabaseClient()

  return useQuery<Tag[], Error>({
    queryKey: ["availableTags"],
    queryFn: () => getAvailableTags(supabase),
  })
}

export function useComponentOwnerUsername(
  supabase: SupabaseClient<Database>,
  slug: string,
) {
  return useQuery<string | null, Error>({
    queryKey: ["componentOwner", slug],
    queryFn: async () => {
      const { data: component, error: componentError } = await supabase
        .from("components")
        .select("user_id")
        .eq("component_slug", slug)
        .single()

      if (componentError || !component) {
        console.error("Error fetching component:", componentError)
        return null
      }

      const { data: user, error: userError } = await supabase
        .from("users")
        .select("username")
        .eq("id", component.user_id)
        .single()

      if (userError || !user) {
        console.error("Error fetching user:", userError)
        return null
      }

      return user.username
    },
  })
}

export async function fetchDependencyComponents(
  supabase: SupabaseClient<Database>,
  dependencySlugs: string[],
) {
  const components = await Promise.all(
    dependencySlugs.map(async (slug) => {
      try {
        const { data, error } = await supabase
          .from("components")
          .select(componentFields)
          .eq("component_slug", slug)
          .returns<(Component & { user: User })[]>()
          .single()

        if (error) {
          console.error("Error fetching dependency component:", error)
          return null
        }

        return data
      } catch (error) {
        console.error("Error fetching dependency component:", error)
        return null
      }
    }),
  )
  return components.filter((c) => c !== null) as (Component & { user: User })[]
}

export function useDependencyComponents(
  supabase: SupabaseClient<Database>,
  componentDependencies: Record<string, string>,
) {
  const dependencySlugs = Object.values(componentDependencies)

  return useQuery({
    queryKey: ["dependencyComponents", dependencySlugs],
    queryFn: () => fetchDependencyComponents(supabase, dependencySlugs),
    enabled: dependencySlugs.length > 0,
    refetchOnMount: true,
    staleTime: 0,
  })
}

async function getTagInfo(
  supabase: SupabaseClient<Database>,
  tagSlug: string,
): Promise<Tag | null> {
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("slug", tagSlug)
    .single()

  if (error) {
    console.error("Error fetching tag info:", error)
    return null
  }

  return data
}

export function useTagInfo(supabase: SupabaseClient<Database>, tagSlug?: string) {
  return useQuery<Tag | null, Error>({
    queryKey: ["tagInfo", tagSlug],
    queryFn: () => tagSlug ? getTagInfo(supabase, tagSlug) : null,
    enabled: !!tagSlug,
    refetchOnMount: true,
    staleTime: 0,
  })
}