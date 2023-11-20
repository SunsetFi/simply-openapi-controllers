import AJV, { ValidationError } from "ajv";
import { isObject, isFunction } from "lodash";
import { OpenAPIObject, SchemaObject } from "openapi3-ts/oas31";

import {
  SOCControllerMethodExtensionData,
  SOCControllerMethodExtensionName,
  validateSOCControllerMethodExtensionData,
} from "../../openapi";
import { ControllerInstance, RequestMethod } from "../../types";
import { isNotNullOrUndefined } from "../../utils";

import { MethodHandlerContext, OperationContext } from "../types";

import { CreateMethodHandlerOpts, MethodHandler } from "./MethodHandler";

function defaultResolveController(
  controller: string | symbol | object,
  ctx: OperationContext,
) {
  if (!isObject(controller)) {
    throw new Error(
      `Controller for operation ${ctx.operation.operationId} handling \"${
        ctx.method
      } ${ctx.path}\" is not an object (got ${String(controller)}).`,
    );
  }

  return controller;
}

function defaultResolveHandler(
  controller: ControllerInstance,
  method: string | symbol | Function,
  ctx: OperationContext,
) {
  if (
    (typeof method === "string" || typeof method === "symbol") &&
    typeof (controller as any)[method] === "function"
  ) {
    method = (controller as any)[method];
  }

  if (!isFunction(method)) {
    throw new Error(
      `Handler for operation \"${
        ctx.operation.operationId
      }\" handling \"${String(method)} ${
        ctx.path
      }\" is not a function (got ${String(method)}).`,
    );
  }

  return method;
}

export function createMethodHandlerFromSpec(
  spec: OpenAPIObject,
  path: string,
  method: RequestMethod,
  ajv: AJV,
  opts: CreateMethodHandlerOpts,
) {
  const pathItem = (spec.paths ?? {})[path];
  if (!pathItem) {
    throw new Error(`Path ${path} not found in spec.`);
  }

  const operation = pathItem[method];
  if (!operation) {
    throw new Error(`Operation ${method} not found on path ${path}.`);
  }

  const extensionData = operation[
    SOCControllerMethodExtensionName
  ] as SOCControllerMethodExtensionData;

  if (!extensionData) {
    throw new Error(
      `Operation ${operation.operationId} is missing the ${SOCControllerMethodExtensionName} extension.`,
    );
  }

  if (!validateSOCControllerMethodExtensionData(extensionData)) {
    throw new Error(
      `Operation ${
        operation.operationId
      } has an invalid ${SOCControllerMethodExtensionName} extension: ${ajv.errorsText(
        validateSOCControllerMethodExtensionData.errors,
      )}}`,
    );
  }

  let { resolveController, resolveHandler } = opts;

  if (!resolveController) {
    resolveController = defaultResolveController;
  }

  if (!resolveHandler) {
    resolveHandler = defaultResolveHandler;
  }

  const ctx: OperationContext = {
    spec,
    path,
    method,
    pathItem,
    operation,
  };

  const controller = resolveController(extensionData.controller, ctx);
  const handler = resolveHandler(controller, extensionData.handler, ctx);

  const createValueProcessor = (schema: SchemaObject) => {
    // Wrap the value so that coersion functions properly on non-reference values.
    const wrappedSchema: SchemaObject = {
      type: "object",
      properties: {
        value: schema,
      },
    };

    const validate = ajv.compile(wrappedSchema);
    return (value: any) => {
      const wrapper = { value };
      if (!validate(wrapper)) {
        // Note: Our errors will have `value` as the property, which isnt nescesarily a bad thing,
        // but, we probably do want to remove it.
        throw new ValidationError(validate.errors!);
      }

      return wrapper.value;
    };
  };

  const processors = (opts.requestDataProcessorFactories ?? [])
    .map((factory) =>
      factory({
        spec,
        path,
        method,
        pathItem,
        operation,
        controller,
        handler,
        createValueProcessor,
      }),
    )
    .filter(isNotNullOrUndefined);

  const context: MethodHandlerContext = {
    spec,
    path,
    method,
    pathItem,
    operation,
    controller,
    handler,
  };

  const handlerMiddleware = [
    ...(opts.handlerMiddleware ?? []),
    ...(extensionData.handlerMiddleware ?? []),
  ];

  const preExpressMiddleware = [
    ...(opts.preExpressMiddleware ?? []),
    ...(extensionData.preExpressMiddleware ?? []),
  ];

  const postExpressMiddleware = [...(opts.postExpressMiddleware ?? [])];

  return new MethodHandler(
    controller,
    handler,
    extensionData.handlerArgs ?? [],
    processors,
    handlerMiddleware,
    preExpressMiddleware,
    postExpressMiddleware,
    context,
  );
}
