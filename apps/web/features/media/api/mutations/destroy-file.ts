'use server'

import { files } from '@skriuw/db'
import { destroyOwned } from '@/lib/server/crud-helpers'

export async function destroyFile(fileId: string) {
    await destroyOwned(files, fileId)

    // TODO: Ideally we should also delete from UploadThing via their API
    // but for now we remove the reference from our library.
}
