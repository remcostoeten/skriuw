import { spawn } from "bun";

export async function checkDockerDB() {
    console.log("\n🔍 Checking Database Status...");

    try {
        // Check if the container matches the one in docker-compose.yml
        const containerName = "skriuw-db"; // from docker-compose.yml

        const proc = spawn(["docker", "inspect", "-f", "{{.State.Running}}", containerName], {
            stdout: "pipe",
            stderr: "pipe",
        });

        const output = await new Response(proc.stdout).text();
        const error = await new Response(proc.stderr).text();
        const isRunning = output.trim() === "true";

        if (isRunning) {
            console.log(`✅ Docker Database '${containerName}' is UP and RUNNING.`);
        } else {
            console.log(`❌ Docker Database '${containerName}' is DOWN or NOT FOUND.`);
            if (error && !error.includes("No such object")) {
                console.log(`   Error: ${error.trim()}`);
            }
            console.log(`   👉 Try running: docker-compose up -d`);
        }

    } catch (error) {
        console.log("⚠️  Failed to check Docker status.");
        console.error(error);
    }
    console.log(""); // Empty line
}

if (import.meta.main) {
    checkDockerDB();
}
