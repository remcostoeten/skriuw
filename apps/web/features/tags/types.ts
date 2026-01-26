export type Tag = {
    id: string
    name: string
    color: string
    userId?: string
    createdAt: number
    updatedAt: number
}

export type TagWithCount = Tag & {
    noteCount: number
}

export type CreateTagInput = {
    name: string
    color?: string
}

export type UpdateTagInput = {
    name?: string
    color?: string
}
