const invoke = window.__TAURI__?.core?.invoke;
const out = document.getElementById("out");
const info = document.getElementById("info");
const name = document.getElementById("name");

async function greet() {
	if (!invoke) {
		out.textContent = "window.__TAURI__ not present — open this inside the Tauri shell.";
		return;
	}
	out.classList.remove("muted");
	out.textContent = await invoke("greet", { name: name.value });
}

document.getElementById("go").addEventListener("click", greet);
name.addEventListener("keydown", (e) => {
	if (e.key === "Enter") greet();
});

(async () => {
	if (!invoke) {
		info.textContent = "window.__TAURI__ not present (running outside Tauri).";
		return;
	}
	info.textContent = JSON.stringify(await invoke("app_info"), null, 2);
})();
