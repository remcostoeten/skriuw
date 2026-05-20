import { expect, test, type Page } from "@playwright/test";
import { instant } from "@next/playwright";
import fs from "node:fs/promises";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import config from "../../skeleton-qa.config";

type BoundingRect = {
	selector: string;
	x: number;
	y: number;
	width: number;
	height: number;
	exists: boolean;
};

type CLSResult = {
	selector: string;
	skeleton: BoundingRect;
	loaded: BoundingRect;
	deltaX: number;
	deltaY: number;
	deltaWidth: number;
	deltaHeight: number;
	shifted: boolean;
};

type RouteReport = {
	route: string;
	viewport: string;
	cls: CLSResult[];
	diffPercentage: number;
	passed: boolean;
};

async function measureLandmarks(page: Page, selectors: string[]): Promise<BoundingRect[]> {
	return page.evaluate((landmarkSelectors) => {
		return landmarkSelectors.map((selector) => {
			const el = document.querySelector(selector);
			if (!el) {
				return { selector, x: 0, y: 0, width: 0, height: 0, exists: false };
			}

			const rect = el.getBoundingClientRect();
			return {
				selector,
				x: Math.round(rect.x),
				y: Math.round(rect.y),
				width: Math.round(rect.width),
				height: Math.round(rect.height),
				exists: true,
			};
		});
	}, selectors);
}

function computeCLS(
	skeletonRects: BoundingRect[],
	loadedRects: BoundingRect[],
	threshold: number,
): CLSResult[] {
	return skeletonRects.map((skeleton, index) => {
		const loaded = loadedRects[index];
		const deltaX = Math.abs(skeleton.x - loaded.x);
		const deltaY = Math.abs(skeleton.y - loaded.y);
		const deltaWidth = Math.abs(skeleton.width - loaded.width);
		const deltaHeight = Math.abs(skeleton.height - loaded.height);
		const shifted =
			skeleton.exists &&
			loaded.exists &&
			(deltaX > threshold ||
				deltaY > threshold ||
				deltaWidth > threshold ||
				deltaHeight > threshold);

		return {
			selector: skeleton.selector,
			skeleton,
			loaded,
			deltaX,
			deltaY,
			deltaWidth,
			deltaHeight,
			shifted,
		};
	});
}

async function compareScreenshots(
	skeletonBuffer: Buffer,
	loadedBuffer: Buffer,
	diffOutputPath: string,
): Promise<number> {
	const skeletonPng = PNG.sync.read(skeletonBuffer);
	const loadedPng = PNG.sync.read(loadedBuffer);
	const width = Math.max(skeletonPng.width, loadedPng.width);
	const height = Math.max(skeletonPng.height, loadedPng.height);

	const normalize = (source: PNG): PNG => {
		if (source.width === width && source.height === height) return source;

		const output = new PNG({ width, height });
		for (let index = 0; index < output.data.length; index += 4) {
			output.data[index] = 255;
			output.data[index + 1] = 255;
			output.data[index + 2] = 255;
			output.data[index + 3] = 255;
		}
		PNG.bitblt(source, output, 0, 0, source.width, source.height, 0, 0);
		return output;
	};

	const normalizedSkeleton = normalize(skeletonPng);
	const normalizedLoaded = normalize(loadedPng);
	const diff = new PNG({ width, height });
	const diffPixels = pixelmatch(
		normalizedSkeleton.data,
		normalizedLoaded.data,
		diff.data,
		width,
		height,
		{ threshold: 0.1 },
	);

	await fs.mkdir(path.dirname(diffOutputPath), { recursive: true });
	await fs.writeFile(diffOutputPath, PNG.sync.write(diff));

	return diffPixels / (width * height);
}

function suggestFix(cls: CLSResult): string {
	if (!cls.skeleton.exists && cls.loaded.exists) {
		return `${cls.selector} exists in the loaded state but is missing from the fallback shell.`;
	}
	if (cls.skeleton.exists && !cls.loaded.exists) {
		return `${cls.selector} appears in the fallback but not in the loaded state.`;
	}
	if (cls.deltaHeight > 50) {
		return `Skeleton height for ${cls.selector} is off by ${cls.deltaHeight}px.`;
	}
	if (cls.deltaWidth > 20) {
		return `Skeleton width for ${cls.selector} is off by ${cls.deltaWidth}px.`;
	}
	if (cls.deltaY > 10) {
		return `${cls.selector} shifts ${cls.deltaY}px vertically.`;
	}
	if (cls.deltaX > 10) {
		return `${cls.selector} shifts ${cls.deltaX}px horizontally.`;
	}
	return `${cls.selector} shifted slightly.`;
}

function printReport(report: RouteReport) {
	const status = report.passed ? "PASS" : "FAIL";
	const diffPct = (report.diffPercentage * 100).toFixed(1);
	const violations = report.cls.filter((result) => result.shifted);

	console.log("");
	console.log(`--- ${status} [${report.viewport}] ${report.route} ---`);
	console.log(`Pixel diff: ${diffPct}% (threshold: ${(config.diffThreshold * 100).toFixed(1)}%)`);
	console.log(`CLS violations: ${violations.length}`);

	for (const violation of violations) {
		console.log(
			`  SHIFT: ${violation.selector} moved (${violation.deltaX}px, ${violation.deltaY}px), size delta (${violation.deltaWidth}px, ${violation.deltaHeight}px)`,
		);
		console.log(`    Fix: ${suggestFix(violation)}`);
	}

	if (report.diffPercentage >= config.diffThreshold && violations.length === 0) {
		console.log(`  DIFF: ${diffPct}% pixel difference exceeds threshold.`);
		console.log("    Fix: Check the relevant Suspense fallback shell structure.");
	}

	if (report.passed) {
		console.log("  No issues.");
	}
}

const resultsDir = path.join(process.cwd(), "test-results", "skeleton-qa");

for (const viewport of config.viewports) {
	for (const route of config.routes) {
		const routeSlug = route.replace(/\//g, "_").replace(/^_/, "") || "index";
		const testName = `[${viewport.name}] ${route} - skeleton vs loaded`;

		test(testName, async ({ page, baseURL }) => {
			await page.setViewportSize({ width: viewport.width, height: viewport.height });

			const outputDir = path.join(resultsDir, viewport.name, routeSlug);
			await fs.mkdir(outputDir, { recursive: true });

			await page.goto(route, { waitUntil: "networkidle" });
			await page.waitForTimeout(config.settleTime);

			const loadedScreenshot = await page.screenshot({ fullPage: true });
			await fs.writeFile(path.join(outputDir, "loaded.png"), loadedScreenshot);
			const loadedRects = await measureLandmarks(page, config.landmarks);

			let skeletonScreenshot: Buffer | null = null;
			let skeletonRects: BoundingRect[] | null = null;

			await instant(
				page,
				async () => {
					await page.goto(route);
					await page.waitForTimeout(200);
					skeletonScreenshot = await page.screenshot({ fullPage: true });
					await fs.writeFile(path.join(outputDir, "skeleton.png"), skeletonScreenshot);
					skeletonRects = await measureLandmarks(page, config.landmarks);
				},
				{ baseURL: baseURL ?? undefined },
			);

			expect(skeletonScreenshot, "Skeleton screenshot was captured").not.toBeNull();
			expect(skeletonRects, "Skeleton landmarks were measured").not.toBeNull();

			const clsResults = computeCLS(skeletonRects!, loadedRects, config.clsThreshold);
			const clsViolations = clsResults.filter((result) => result.shifted);
			const diffPercentage = await compareScreenshots(
				skeletonScreenshot!,
				loadedScreenshot,
				path.join(outputDir, "diff.png"),
			);

			const report: RouteReport = {
				route,
				viewport: viewport.name,
				cls: clsResults,
				diffPercentage,
				passed: clsViolations.length === 0 && diffPercentage < config.diffThreshold,
			};

			await fs.writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
			printReport(report);

			expect(
				clsViolations,
				`${clsViolations.length} landmark(s) shifted between skeleton and loaded states`,
			).toHaveLength(0);

			expect(
				diffPercentage,
				`Pixel diff is ${(diffPercentage * 100).toFixed(1)}%, above the ${(config.diffThreshold * 100).toFixed(1)}% threshold`,
			).toBeLessThan(config.diffThreshold);
		});
	}
}
