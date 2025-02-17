import {
  SchemaObject,
  SchemaObjectType,
  OpenAPIObject,
  ReferenceObject,
} from "openapi3-ts/oas31";
import Ptr from "@json-schema-spec/json-pointer";

export function schemaIncludesType(
  schema: SchemaObject,
  type: SchemaObjectType,
) {
  const types = getTypes(schema);
  return types.includes(type);
}

export function schemaIncludesAnyTypeExcept(
  schema: SchemaObject,
  type: SchemaObjectType,
) {
  const types = getTypes(schema);
  return !types.includes(type) || types.length > 1;
}

export function getSchemaSingleTypeOrNull(schema: SchemaObject) {
  return Array.isArray(schema.type) ? null : schema.type;
}

function getTypes(schema: SchemaObject): SchemaObjectType[] {
  let types: SchemaObjectType[] = [];

  if (schema.type) {
    types.push(...(Array.isArray(schema.type) ? schema.type : [schema.type]));
  }

  // Only go one deep
  if (schema.oneOf) {
    for (const item of schema.oneOf) {
      // Should we support references here?
      const itemSchema = item as SchemaObject;
      if (itemSchema.type) {
        types.push(
          ...(Array.isArray(itemSchema.type)
            ? itemSchema.type
            : [itemSchema.type]),
        );
      }
    }
  }

  if (schema.anyOf) {
    for (const item of schema.anyOf) {
      // Should we support references here?
      const itemSchema = item as SchemaObject;
      if (itemSchema.type) {
        types.push(
          ...(Array.isArray(itemSchema.type)
            ? itemSchema.type
            : [itemSchema.type]),
        );
      }
    }
  }

  return types;
}

/**
 * Pick a value from the record based on the matched content type.
 * @param contentType The content type to match
 * @param values A record where keys are media type patterns and values are the values to pick.
 * @returns The picked value, or null if no value matched.
 */
export function pickContentType<T>(
  contentType: string | null,
  values: Record<string, T>,
): T | null {
  if (contentType === "") {
    contentType = null;
  }

  if (contentType) {
    const semicolon = contentType.indexOf(";");
    if (semicolon !== -1) {
      contentType = contentType.substring(0, semicolon);
    }
  }

  if (!contentType) {
    return values["*/*"] ?? null;
  }

  const contentTypeParts = contentType.split("/");
  let chosen: T | null = null;
  let wildcardsUsed = 0;
  // We could use type-is here, but we need to search all values to find the most accurate one.
  // We also need to get the type returned, not the resolved content type, as that is needed
  // to pick the value.
  for (const [type, value] of Object.entries(values)) {
    const typeParts = type.split("/");
    if (typeParts[0] !== "*" && typeParts[0] !== contentTypeParts[0]) {
      continue;
    }

    if (typeParts[1] !== "*" && typeParts[1] !== contentTypeParts[1]) {
      continue;
    }

    let localWildcards =
      (typeParts[0] === "*" ? 1 : 0) + (typeParts[1] === "*" ? 1 : 0);
    if (!chosen || localWildcards < wildcardsUsed) {
      wildcardsUsed = localWildcards;
      chosen = value;
      if (localWildcards === 0) {
        break;
      }
    }
  }

  return chosen;
}

/**
 * Resolve value that may be a reference to the actual value.
 * @param spec The OpenAPI spec root object.
 * @param value The referencable value.
 * @returns The resolved value or null if the reference could not be resolved.
 */
export function resolveReference<T extends object>(
  spec: OpenAPIObject,
  value: T | ReferenceObject,
): T | null {
  if ("$ref" in value) {
    if (!value["$ref"].startsWith("#")) {
      throw new Error(
        `Cannot resolve external reference "${value["$ref"]}" in the OpenAPI schema.`,
      );
    }
    const ptr = Ptr.parse(value["$ref"].substring(1));
    try {
      return ptr.eval(spec);
    } catch {
      return null;
    }
  }

  return value;
}
