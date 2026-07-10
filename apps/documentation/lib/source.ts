import { loader } from "fumadocs-core/source";
import { docs } from "collections/server";

export const source = loader({
	baseUrl: "/",
	source: docs.toFumadocsSource(),
});
