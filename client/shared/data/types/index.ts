import type { Dispatch, SetStateAction } from 'react'

// Base CRUD interfaces
export interface BaseEntity {
    id: string
    createdAt: number
    updatedAt: number
}

export interface CreateResult<T> {
    data: T
    success: boolean
    error?: string
}

export interface UpdateResult<T> {
    data: T
    success: boolean
    error?: string
}

export interface DeleteResult {
    success: boolean
    error?: string
}

export interface ReadResult<T> {
    data: T | null
    success: boolean
    error?: string
}

export interface ListResult<T> {
    data: T[]
    success: boolean
    error?: string
    totalCount?: number
}

// Optimistic update interfaces
export interface OptimisticUpdate<T> {
    id: string
    type: 'create' | 'update' | 'delete'
    data?: Partial<T>
    previousData?: T
    timestamp: number
}

export interface CRUDConfig<T extends BaseEntity> {
    entityName: string
    storage: {
        create: (data: Omit<T, keyof BaseEntity>) => Promise<T>
        read: (id: string) => Promise<T | null>
        update: (id: string, data: Partial<T>) => Promise<T | null>
        delete: (id: string) => Promise<boolean>
        list: (filters?: any) => Promise<T[]>
    }
    cache?: {
        queryKey: string[]
        invalidateQueries: () => void
        setQueryData: (id: string, data: T) => void
        getQueryData: (id: string) => T | undefined
    }
    optimistic?: {
        enabled: boolean
        maxAge: number // ms
    }
    validation?: {
        create: (data: any) => Promise<boolean>
        update: (data: any) => Promise<boolean>
    }
}

// CRUD operation hooks result
export interface CRUDResult<T> {
    data: T | null
    isLoading: boolean
    error: string | null
    isOptimistic: boolean
    transition: {
        isPending: boolean
        startTransition: (callback: () => void) => void
    }
}

export interface CRUDListResult<T> {
    data: T[]
    isLoading: boolean
    error: string | null
    totalCount: number
    refetch: () => void
    transition: {
        isPending: boolean
        startTransition: (callback: () => void) => void
    }
}
export interface UserSetting<T = any> {
    key: string
    value: T
    defaultValue: T
    type: 'string' | 'number' | 'boolean' | 'object' | 'enum'
    description: string
    category: SettingsCategory
    requiresRestart?: boolean
    options?: T[] // For enum type settings
    validation?: (value: T) => boolean | string
}

export type SettingsCategory =
    | 'editor'
    | 'appearance'
    | 'behavior'
    | 'shortcuts'
    | 'backup'
    | 'advanced'

export interface SettingsGroup {
    category: SettingsCategory
    title: string
    description: string
    settings: UserSetting[]
}

export interface SettingsConfig {
    key: string
    defaultValue: any
    type: 'string' | 'number' | 'boolean' | 'object' | 'enum'
    description: string
    category: SettingsCategory
    requiresRestart?: boolean
    options?: any[]
    validation?: (value: any) => boolean | string
}

export interface FeatureFlag {
    key: string
    enabled: boolean
    description: string
    category: SettingsCategory
}
// Query key factory
export interface QueryKeys {
    all: string[]
    lists: (filters?: any) => string[]
    details: (id: string) => string[]
    mutations: () => string[]
}

// Mutation options with optimistic updates
export interface MutationOptions<TData, TError, TVariables> {
    onMutate?: (variables: TVariables) => Promise<TData | undefined>
    onSuccess?: (data: TData, variables: TVariables) => void
    onError?: (error: TError, variables: TVariables, context?: any) => void
    onSettled?: (
        data: TData | undefined,
        error: TError | null,
        variables: TVariables
    ) => void
    optimistic?: boolean
    invalidateQueries?: string[]
}
