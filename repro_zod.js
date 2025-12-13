
const { z } = require('zod');

const nonEmpty = z.string().trim().min(1, 'Required');
const regionPattern = /^[a-z0-9-]+$/i;

const schemas = {
    s3: z.object({
        accessKeyId: nonEmpty,
        secretAccessKey: nonEmpty,
        region: z
            .string()
            .trim()
            .regex(regionPattern, 'Invalid region format'),
        bucket: nonEmpty,
        endpoint: z.string().optional(),
    }),
    dropbox: z.object({
        accessToken: nonEmpty,
        rootPath: z.string().trim().optional(),
    }),
};

function test(type, data) {
    console.log(`Testing ${type} with`, data);
    const result = schemas[type].safeParse(data);
    if (!result.success) {
        console.log('Error issues:', JSON.stringify(result.error.issues, null, 2));
        console.log('Message:', result.error.issues[0].message);
    } else {
        console.log('Success');
    }
}

test('s3', {});
test('s3', { region: undefined });
test('dropbox', {});
