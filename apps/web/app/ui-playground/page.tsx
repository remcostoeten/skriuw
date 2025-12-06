'use client'

import { useState } from 'react'
import { Checkbox } from '@skriuw/ui/primitives/checkbox'
import { Switch } from '@skriuw/ui/primitives/switch'

export default function UIPlayground() {
	const [checkboxStates, setCheckboxStates] = useState({
		default: false,
		indeterminate: false,
		disabled: false,
		loading: false,
	})

	const [switchStates, setSwitchStates] = useState({
		default: false,
		indeterminate: false,
		disabled: false,
		loading: false,
	})

	const handleCheckboxChange = (key: string, checked: boolean) => {
		setCheckboxStates((prev) => ({ ...prev, [key]: checked }))
	}

	const handleSwitchChange = (key: string, checked: boolean) => {
		setSwitchStates((prev) => ({ ...prev, [key]: checked }))
	}

	return (
		<div className="container mx-auto p-8 space-y-12 max-w-4xl">
			<div className="space-y-4">
				<h1 className="text-3xl font-bold">UI Playground</h1>
				<p className="text-muted-foreground">Development showcase for UI components</p>
			</div>

			{/* Checkbox Section */}
			<div className="space-y-6">
				<div>
					<h2 className="text-2xl font-semibold mb-4">Checkboxes</h2>
					<div className="grid gap-6 md:grid-cols-2">
						<div className="space-y-4 p-6 border rounded-lg">
							<h3 className="font-medium">Basic States</h3>
							<div className="space-y-3">
								<Checkbox
									checked={checkboxStates.default}
									onChange={(checked) => handleCheckboxChange('default', checked)}
									label="Default checkbox"
								/>
								<Checkbox
									checked={checkboxStates.indeterminate}
									indeterminate={!checkboxStates.indeterminate}
									onChange={(checked) => handleCheckboxChange('indeterminate', checked)}
									label="Indeterminate checkbox"
								/>
								<Checkbox
									disabled
									checked={checkboxStates.disabled}
									onChange={(checked) => handleCheckboxChange('disabled', checked)}
									label="Disabled checkbox"
								/>
								<Checkbox
									loading={checkboxStates.loading}
									checked={checkboxStates.loading}
									onChange={(checked) => handleCheckboxChange('loading', checked)}
									label="Loading checkbox"
								/>
							</div>
						</div>

						<div className="space-y-4 p-6 border rounded-lg">
							<h3 className="font-medium">Variants</h3>
							<div className="space-y-3">
								<Checkbox variant="default" label="Default variant" defaultChecked />
								<Checkbox variant="outline" label="Outline variant" defaultChecked />
								<Checkbox variant="filled" label="Filled variant" defaultChecked />
								<Checkbox variant="minimal" label="Minimal variant" defaultChecked />
							</div>
						</div>

						<div className="space-y-4 p-6 border rounded-lg">
							<h3 className="font-medium">Sizes</h3>
							<div className="space-y-3">
								<Checkbox size="sm" label="Small size" defaultChecked />
								<Checkbox size="md" label="Medium size" defaultChecked />
								<Checkbox size="lg" label="Large size" defaultChecked />
							</div>
						</div>

						<div className="space-y-4 p-6 border rounded-lg">
							<h3 className="font-medium">With Labels & Descriptions</h3>
							<div className="space-y-4">
								<Checkbox
									label="Terms and Conditions"
									description="I agree to the terms and conditions"
									defaultChecked
								/>
								<Checkbox
									label="Email Notifications"
									description="Receive email updates about your account"
									labelPosition="left"
								/>
								<Checkbox
									label="Marketing Emails"
									description="Get promotional offers and new feature announcements"
									error="This field is required"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Switch Section */}
			<div className="space-y-6">
				<div>
					<h2 className="text-2xl font-semibold mb-4">Switches</h2>
					<div className="grid gap-6 md:grid-cols-2">
						<div className="space-y-4 p-6 border rounded-lg">
							<h3 className="font-medium">Basic States</h3>
							<div className="space-y-3">
								<Switch
									checked={switchStates.default}
									onCheckedChange={(checked) => handleSwitchChange('default', checked)}
									label="Default switch"
								/>
								<Switch
									checked={switchStates.indeterminate}
									indeterminate={!switchStates.indeterminate}
									onCheckedChange={(checked) => handleSwitchChange('indeterminate', checked)}
									label="Indeterminate switch"
								/>
								<Switch
									disabled
									checked={switchStates.disabled}
									onCheckedChange={(checked) => handleSwitchChange('disabled', checked)}
									label="Disabled switch"
								/>
								<Switch
									loading={switchStates.loading}
									checked={switchStates.loading}
									onCheckedChange={(checked) => handleSwitchChange('loading', checked)}
									label="Loading switch"
								/>
							</div>
						</div>

						<div className="space-y-4 p-6 border rounded-lg">
							<h3 className="font-medium">Variants</h3>
							<div className="space-y-3">
								<Switch variant="slide" label="Slide variant" defaultChecked />
								<Switch variant="slide-snappy" label="Slide Snappy variant" defaultChecked />
								<Switch variant="slide-gentle" label="Slide Gentle variant" defaultChecked />
								<Switch variant="slide-elastic" label="Slide Elastic variant" defaultChecked />
							</div>
						</div>

						<div className="space-y-4 p-6 border rounded-lg">
							<h3 className="font-medium">Sizes</h3>
							<div className="space-y-3">
								<Switch size="sm" label="Small size" defaultChecked />
								<Switch size="md" label="Medium size" defaultChecked />
								<Switch size="lg" label="Large size" defaultChecked />
							</div>
						</div>

						<div className="space-y-4 p-6 border rounded-lg">
							<h3 className="font-medium">With Labels & Descriptions</h3>
							<div className="space-y-4">
								<Switch
									label="Dark Mode"
									description="Enable dark theme across the application"
									defaultChecked
								/>
								<Switch
									label="Auto-save"
									description="Automatically save changes as you type"
									labelPosition="left"
								/>
								<Switch
									label="Experimental Features"
									description="Enable early access to new features"
									error="This feature is temporarily unavailable"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
