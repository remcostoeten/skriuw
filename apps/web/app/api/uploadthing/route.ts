import { createRouteHandler } from 'uploadthing/next'
import { ourFileRouter } from './core'
import { getUserUploadKey } from '@/features/uploads/get-user-upload-key'
import { NextRequest } from 'next/server'

export async function POST(req: Request) {
    const userToken = await getUserUploadKey()
    const { POST } = createRouteHandler({
        router: ourFileRouter,
        config: {
            token: userToken || process.env.UPLOADTHING_TOKEN
        }
    })
    return POST(req as any)
}

export async function GET(req: Request) {
    const userToken = await getUserUploadKey()
    const { GET } = createRouteHandler({
        router: ourFileRouter,
        config: {
            token: userToken || process.env.UPLOADTHING_TOKEN
        }
    })
    return GET(req as any)
}
