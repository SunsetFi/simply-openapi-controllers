# SEC - Simply Express Controllers

No heavy frameworks, no IOC, just a simple robust express controller library using modern ES6 decorators.

Simply Express Controllers is an OpenAPI-First controller library. It produces fully robust method handlers on controllers by consuming an OpenAPI 3.1 specification and calling your handlers
with all data pre-validated and coerced according to your specification.

Don't have OpenAPI specs? No problem! SEC also provides decorators for your classes and methods that will create the openapi spec for you according to your handler usage and declaration.

SEC is designed to be a single-purpose library. It solves the use case of producing robust controllers and methods for web request handling, and does not dictate any design patterns beyond what it needs to do its job.  
It is highly extensible, supporting both the typical express middleware, plus its own middleware for method handlers, allowing you to integrate with the method creation for customizing both the inputs and outputs of your controller methods.

## Forward: Enforcing your endpoint contracts through OpenAPI

Before getting into the specifics of this library, its important to know what makes OpenAPI so powerful as a source to derive our handlers from.

OpenAPI is very expressive when it comes to the specification of the inputs and outputs of handler functions. OpenAPI specs can define the exact shape and requirements of parameters, bodies, and even response types differing across status codes and content types. All of this information encapsulates declarative instructions that normally would be implemented by the developers: Type checks, null checks, coersion, casting, default values, and error handling all provide a great amount of boilerplate that must be written for all endpoint handlers. However, since OpenAPI already defines all of this, why not derive it programmically and automate away such boilerplate?

This is the core concept of simply-openapi-controllers.

For example, let's take this simple OpenAPI example:

````json
{
  "openapi": "3.0.0",
  "info": {
    "version": "1.0.0",
    "title": "Swagger Petstore",
    "license": {
      "name": "MIT"
    }
  },
  "servers": [
    {
      "url": "http://petstore.swagger.io/v1"
    }
  ],
  "paths": {
"/pets/{petId}": {
      "get": {
        "summary": "Info for a specific pet",
        "operationId": "showPetById",
        "tags": [
          "pets"
        ],
        "parameters": [
          {
            "name": "petId",
            "in": "path",
            "required": true,
            "description": "The id of the pet to retrieve",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Expected response to a valid request",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Pet"
                }
              }
            }
          },
          "default": {
            "description": "unexpected error",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
}
  }
}

      ```



## OpenAPI is definitive, everything else follows

The philosophy of SEC is that the OpenAPI spec (either self-provided or described in-code by decorators) should be the definitive form of the service, and the handlers should conform to it. In practice, that means
every declarative statement the spec can make will be enforced in your methods:

- Parameters and bodies will be validated against their schema. If the schema doesn't match, your method will not be called and the appropriate error will be returned
- Parameters and bodes will be coerced to the schema. The schema type indicates a number? If the parameter is a valid number, it will be casted before being forwarded to the controller. Your body schema includes default values? Those defaults will be populated.
- Response contracts are still contracts! Optional support is provided for validating all outgoing data to ensure your service is responding with what it is documented as responding. This can be enforced in development, and log warnings in production.

This is in contrast to many other controller libraries, that try to generate openapi spec ad-hoc from the controllers and do not make an effort to enforce compliance.

## Write once

OpenAPI provides a definitive description of the service, and so no additional code should be needed. Unlike other controller libraries where writing an openapi spec decorator on your method provides no functional benefit aside from
documentation, SEC uses OpenAPI as the source of truth for how all methods should behave. Write the OpenAPI docs describing the expected inputs and outputs of your method, and SEC guarentees your method is never called in a way that violates that schema. No additional type guards, validation pipes, or documentation schema is needed. Provide the docs and you are good to go.

## Pluggable everywhere

Need a different serialization type? Need additional transformations on inputs before passing them to your methods? A middleware system for handlers is provided, allowing both the inputs to your methods as well as the method responses to be tweaked, transformed, and handled with ease. Middleware can be injected at the global level, class level, and individual methods.

SEC even uses this middleware system for its own core features, meaning any middleware you provide can override any default behavior of SEC. Need specialized handling of your method response to your express response? Need customized error handling? Want to return DTOs from your methods and serialize them dependent on request content types? No problem! Provide a handler middleware you are good to go!

## Usage

There are 3 ways to use SEC:

- [Produce routers from predefined OpenAPI schema and annotated controllers](#producing-routers-from-existing-openapi-specs)
- [Produce both routers and OpenAPI schema from controllers and handler methods using decorators](#producing-routers-and-openapi-specs-from-controller-and-handler-decorators)
- [Produce routers from OpenAPI schema adorned with `x-sec` extensions](#producing-routers-from-openapi-spec-annotated-with-the-sec-extensions)

### Producing routers from existing OpenAPI specs

When you have OpenAPI specs already written and you just want to attach controllers, you can do so using the `@BindOperation` decorator.
This decorator allows you to attach controller methods to arbitrary OpenAPI Operation by their operation id.

When using this decorator, it is important to use `@BindParam` and `@BindBody` decorators instead of the typical `@PathParam`, `@QueryParam`, and `@Body` decorators, as the latter will try to redefine
openapi specs. If this mixup occurs, SEC will throw an error.

The original OpenAPI Schema:

```ts
const mySpec = {
  "openapi": "3.1.0",
  "info": {...},
  "paths": {
    "/add": {
      "post": {
        "operationId": "post-add",
        "parameters": [
          {
            "in": "query",
            "name": "a",
            "schema": {
              "type": "number"
            }
          },
          {
            "in": "query",
            "name": "b",
            "schema": {
              "type": "number"
            }
          }
        ],
        "response-raw": {
          "200": {
            "content": {
              "application/json": {
                "schema": {"type": "number" }
              }
            }
          }
        }
      }
    }
  }
}
````

The controller you would like to bind:

```ts
class MyController {
  @BindOperation("post-add")
  getHelloWorld(@BindParam("a") a: number, @BindParam("b") b: number): number {
    return a + b;
  }
}
```

Note how the types of both parameters are numbers, not strings. This is because the OpenAPI doc typed the query parameters as numbers, and SEC obediently casted the values to javascript numeric values before passing it to the handler function.
If this method was to be called with non-number query values, SEC's handler will return a 400 Bad Request explaining the invalid value and the handler will not be called.

Also note that the response is typed as number. You may optionally enforce this at runtime. See [Enforcing return types at runtime](#enforcing-return-types-at-runtime)

With this combination, you can produce a functional express route in two steps.

First, we need to take our openapi spec and annotate it with the extensions that describe our controller.

```ts
import { attachBoundControllersToOpenAPI } from "simply-openapi-controllers";

const annotatedSpec = attachBoundControllersToOpenAPI(mySpec, [
  new MyController(),
]);
```

This will create a new OpenAPI spec that contains metadata describing our controllers and handlers. Note that during this process, if one of your controllers asks for an operation or binding parameter that is not defined in the openapi spec, an error will be thrown describing the issue.

Now that we have our annotated spec, we can create an express router that implements it:

```ts
const routerFromSpec = createRouterFromSpec(annotatedSpec);
```

You are now ready to use the router in your app. See [Using the produced router](#using-the-produced-router).

### Producing Routers and OpenAPI specs from controller and handler decorators

If you want to focus on the code and leave the OpenAPI specs to be auto-generated, you can produce both the routers and the specs entirely from decorators adorning Controller classes

```ts
@Controller("/v1", { tags: ["Math"] })
class MyController {
  @Post("/add", { summary: "Adds two numbers", tags: ["Addition"] })
  @JsonResonse(200, "The sum of the two numbers", { type: number })
  addNumbers(
    @QueryParam("a", { type: "number" }) a: number,
    @QueryParam("b", { type: "number" }) b: number
  ) {
    return a + b;
  }
}
```

This is sufficient to create a fully formed OpenAPI specification, although more decorators exist to further annotate the document if desired. See [Decorator reference](#decorator-reference).

You can then produce the OpenAPI spec out of your controller with:

```ts
const openApiSpec = createOpenAPIFromControllers([new MyController()]);
```

Note that if you are integrating into an existing app and already have existing OpenApi specs, you can produce only the path object with `createOpenAPIPathsFromControllers`, which takes the same signature.

Once you have produced the spec, creating a router to handle it is simple:

```ts
const routerFromSpec = createRouterFromSpec(annotatedSpec);
```

You are now ready to use the router in your app. See [Using the produced router](#using-the-produced-router).

### Producing routers from OpenAPI spec annotated with the SEC extensions

Despite all the decorators, the root spec SEC operates on is an OpenAPI specification object. It is possible to write these entirely by hand if so desired.

All metadata needed by SEC to wire up controllers is stored on the `x-sec-controller-method` extension on Operation objects.

TODO: More friendly walkthrough on setting this up. Don't just dump typescript typings here.

The `x-sec-controller-method` extension contains an object with the following properties:

```ts
export interface SECControllerMethodExtensionData {
  /**
   * The class instance of the controller class.
   * If this is a string or symbol, then the resolveController option must be passed to createRouterFromSpec to successfully create a controller.
   */
  controller: object | string | symbol;

  /**
   * The handler method of the controller class.
   * If this is a string or symbol, then createRouterFromSpec will attempt to find a method by that key on the controller.
   * If other behavior is desired, this may be overridden by passing the resolveHandler option to createRouterFromSpec.
   */
  handler: Function | string | symbol;

  /**
   * An array of objects describing the purpose of each argument to the handler function.
   * The order if this array should match the order of the parameters in the function that they pertain to.
   */
  handlerArgs?: SECControllerMethodHandlerArg[];

  /**
   * Middleware for wrapping the handler function.
   * These can replace parameters and reinterpret the handler's results as needed.
   *
   * These middlewares are responsible for sending the return value of the handler to the response.
   * While defaults are provided to do this, you can customize the behavior of the responses by overriding this behavior here.
   */
  handlerMiddleware?: OperationHandlerMiddleware[];

  /**
   * Express middleware to run around the handler.
   */
  expressMiddleware?: Middleware[];
}

/**
 * Metadata about the argument of a controller method handler function.
 */
export type SECControllerMethodHandlerArg =
  | SECControllerMethodHandlerParameterArg
  | SECControllerMethodHandlerBodyArg
  | SECControllerMethodHandlerRequestArg
  | SECControllerMethodHandlerResponseArg;

/**
 * Describes an argument that pulls data from an OpenAPI parameter.
 */
export interface SECControllerMethodHandlerParameterArg {
  type: "openapi-parameter";

  /**
   * The name of the OpenAPI parameter in the operation to insert into this argument.
   */
  parameterName: string;
}

/**
 * Describes an argument that pulls data from the request body.
 */
export interface SECControllerMethodHandlerBodyArg {
  type: "request-body";
}

/**
 * Describes an argument that expects the HTTP request.
 */
export interface SECControllerMethodHandlerRequestArg {
  type: "request-raw";
}

/**
 * Describes an argument that expects the HTTP response.
 */
export interface SECControllerMethodHandlerResponseArg {
  type: "response-raw";
}
```

## Using the produced router

The created router is entirely self-contained, and all SEC features should work out of the box simply by connecting the router to your express app. As SEC is focused only on the request handler level, it provides no requirements on how you create or customize your express app.

However, despite these defaults, you are still able to influence SEC's behavior by supplanting its middleware with your own.

### Overriding the default express middleware

The routers produced by SEC are miniamlistic and only cover mapping openapi requests to handlers and provide the minimial middleware to do this job.

The middlewares SEC defaults within its handlers are:

- body-parser.json({strict: true})
- error handling for errors produced by the `http-errors` npm library, or those providing similar properties on thrown error objects.

You are free to override both of these middleware choices.

- body-parser is wrapped in a check that will not parse the body if req.body is already set, so as to not inferfere with your own body-parsing. You can supply your own middleware to override this.
- error handling can be overriden by providing your own error handler to the expressMiddleware option of createRouterFromSpec

Note that the built in error handler will use console.error to record errors, which is not ideal if you have your own logging framework. You can override this behavior by providing your own logger to SEC's middleware creator.

```ts
import pino from "pino";
import { createRouterFromSpec, createHandleHttpErrorsMiddleware } from "simply-openapi-controllers";

...

const router = createRouterFromSpec(openApiSpec, {
  expressMiddleware: [
    createHandleHttpErrorsMiddleware({
      logger: (err, ctx, message) => pino.error({err, ...ctx}, message)
    })
  ]
})
```

For best results, you should consider providing your own middleware for various purposes:

- Handling arbitrary non-http errors (ideally at the express application level)
- authentication and security (either globally, across the spec with the expressMiddleware option, or per-controler or per-method with the @UseRequestMiddleware() decorator)

You have a few choices of where to add your middleware:

- Globablly at your express app, or any router that preceeds the SEC router.
- In the SEC router, using the `expressMiddleware` option of `createRouterFromSpec`
- Targeting whole controllers, using the @UseRequestMiddleware() decorator
- Targeting individual handler methods, using the @UseRequestMiddleware() decorator.

## Returning status codes, headers, cookies, and non-json bodies.

From time to time, greater control is needed over the exact response sent by your handler. For example, you might send a Location header with the location of a newly created resource, or you may need to choose a status code
based on the action taken by the handler. For this, the `ResponseObject` exists.

This object provides a testable and mockable abstraction over the usual operations done to the express Response object. It can be used as a stand-in for injecting the express response, and is handled internally by an operation handler middleware provided by default.

(Note: If you need further customization, you can supply your own operation handler middleware to intercept and work with this object directly, or you can create your own return types and middleware).

Usage:

```ts
@Controller("/widgets")
class MyController {
  @Put("/", {
    summary: "Create or update widgets",
    tags: ["Widgets"],
  })
  putWidget(
    @RequireJsonBody("The widget to create or update", widgetSchema)
    body: Widget
  ) {
    const existingWidget = repository.findItemById(body.id);
    if (existingWidget) {
      return ResultObject.status(200).json(existingWidget);
    }

    const newWidget = repository.createItem(body);
    return ResultObject.status(201)
      .header("Location", `http://widgetfactory.biz/widgets/${newWidget.id}`)
      .json(newWidget);
  }
}
```

## Escaping SEC and using raw express requests and responses

Accessing express requests and responses directly can cause complications for development, as it complicates unit testing and hides the declarative requirements of your handler function.

However, no library can cover all use cases, so both the request and response objects can be made available to handlers using the `@Req` and `@Res` parameter decorators.
There is no way to access the `next` function, however, as controller methods are handled in their own middleware stack that differs from that of express.

```ts
@Controller("/")
class MyController {
  @Get("/")
  rawHandler(@Req() req: Request, @Res() res: Response) {
    ...
  }
}
```

Of particular note, if you plan on handling the response completely, ensure your method returns either undefined or a promise resolving to undefined. Passing results from
your handler will be intercepted by handler middleware and interpreted as endpoint results to be sent to the client.

All default result handlers in SEC interpret an undefined result to mean that the response was already handled and no further work is needed. However, there is a safty fallback in place
where if a function returns undefined, the very last handler middleware will ensure that res.headersSent is true. If not, it will throw an error. This is to guard against accidentally
not sending any response at all and leaving the request hanging.

As always, handling of responses can be overridden by your own handlerMiddleware, if your needs differ.

## Enforcing return types at runtime

TODO

## Decorator reference

TODO
