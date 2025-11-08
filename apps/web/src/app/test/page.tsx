'use client'

import { Button } from '@/components/ui/button'
import { Header } from '@/components/ui/header'

export default function TestPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Test Page"
        subtitle="Testing our new static UI components"
        actions={
          <>
            <Button
              variant="static"
              size="static"
              onClick={() => console.log('Test button clicked')}
            >
              Test Button
            </Button>
            <Button
              variant="primary"
              size="static"
              loading={false}
            >
              Primary Button
            </Button>
          </>
        }
      />

      <div className="pt-20 p-8">
        <h1 className="text-2xl font-bold mb-4">Component Test Page</h1>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Button Variants:</h2>

          <div className="flex gap-4 flex-wrap">
            <Button variant="default">Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="primary">Primary</Button>
            <Button variant="static">Static</Button>
          </div>

          <h2 className="text-lg font-semibold mt-6">Button Sizes:</h2>
          <div className="flex gap-4 items-center flex-wrap">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon">🔥</Button>
            <Button size="static">Static</Button>
          </div>

          <h2 className="text-lg font-semibold mt-6">Button States:</h2>
          <div className="flex gap-4 flex-wrap">
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
            <Button leftIcon="➡️">Left Icon</Button>
            <Button rightIcon="⬅️">Right Icon</Button>
            <Button fullWidth>Full Width</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
