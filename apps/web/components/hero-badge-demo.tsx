import HeroBadge from '@skriuw/ui/hero-badge'
import { Icons } from '@skriuw/ui/icons'

function HeroBadgeBasic() {
	return (
		<div className="flex min-h-[350px] w-full items-center justify-center">
			<HeroBadge
				href="/docs"
				text="New! PrismUI Components"
				icon={<Icons.logo className="h-4 w-4" />}
				endIcon={<Icons.chevronRight className="h-4 w-4" />}
			/>
		</div>
	)
}

export { HeroBadgeBasic }
