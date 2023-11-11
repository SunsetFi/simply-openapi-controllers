import { ParameterObject, BaseParameterObject } from "openapi3-ts/oas31";

import { mergeSOCControllerMethodMetadata } from "../../../metadata";
import { SOCControllerMethodHandlerArg } from "../../../openapi";

export function createParameterDecorator(
  name: string,
  paramIn: ParameterObject["in"],
  paramObject: BaseParameterObject
) {
  return (
    target: any,
    propertyKey: string | symbol | undefined,
    parameterIndex: number
  ) => {
    if (propertyKey === undefined) {
      throw new Error(`@QueryParam() must be applied to a method.`);
    }

    // Warn: We might be a bound method.  In which case, operationFragment will be totally ignored.
    mergeSOCControllerMethodMetadata(
      target,
      {
        operationFragment: {
          parameters: [
            {
              in: paramIn,
              name,
              ...paramObject,
            },
          ],
        },
      },
      propertyKey
    );
    setMethodParameterType(target, propertyKey, parameterIndex, {
      type: "openapi-parameter",
      parameterName: name,
    });
  };
}

export function setMethodParameterType(
  target: any,
  propertyKey: string | symbol,
  parameterIndex: number,
  arg: SOCControllerMethodHandlerArg
) {
  mergeSOCControllerMethodMetadata(
    target,
    (previous) => {
      const args = [...(previous.args ?? [])];
      if (args[parameterIndex]?.type) {
        throw new Error(
          `Method handler ${String(
            propertyKey
          )} cannot redefine the parameter type at index ${parameterIndex}.`
        );
      }

      args[parameterIndex] = arg;
      return {
        ...previous,
        args,
      };
    },
    propertyKey
  );
}
