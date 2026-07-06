import { installDevtoolsHookStub } from "@/shared/devtools/devtools-hook";

if (import.meta.env.DEV) {
	installDevtoolsHookStub();
}
