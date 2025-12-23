import Image from 'next/image'
import { ProjectMedia } from '../types/projects'
import { MotionPanel } from './motion-panel'

export function MediaFrame({ media }: { media: ProjectMedia }) {
	return (
		<MotionPanel>
			<div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-muted/40 to-background shadow-[0_30px_120px_-60px_rgba(0,0,0,0.9)]">
				{media.type === 'video' ? (
					<video
						src={media.src}
						className="w-full h-full object-cover"
						controls
						playsInline
						preload="metadata"
						muted
						loop
					>
						Sorry, your browser does not support embedded videos.
					</video>
				) : (
					<Image
						src={media.src}
						alt={media.alt}
						width={1600}
						height={900}
						className="w-full h-full object-cover"
						priority={false}
						loading="lazy"
					/>
				)}
			</div>
		</MotionPanel>
	)
}
