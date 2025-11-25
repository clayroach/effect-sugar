/**
 * Example usage of Effect-TS syntactic sugar
 *
 * This file demonstrates the gen { } syntax before transformation.
 * After running through babel-plugin-effect-sugar, the eff blocks
 * will be converted to Effect.gen calls.
 */

import { Effect, Console } from "effect";

// Type definitions
interface User {
  id: number;
  name: string;
  email: string;
}

interface Profile {
  userId: number;
  bio: string;
  avatar: string;
}

interface Post {
  id: number;
  title: string;
}

// Simulated async operations
const getUser = (id: number): Effect.Effect<User> =>
  Effect.succeed({ id, name: "Alice", email: "alice@example.com" });

const getProfile = (userId: number): Effect.Effect<Profile> =>
  Effect.succeed({ userId, bio: "Software Engineer", avatar: "/avatar.png" });

const getPosts = (userId: number): Effect.Effect<Post[]> =>
  Effect.succeed([
    { id: 1, title: "Hello World" },
    { id: 2, title: "Effect-TS is awesome" },
  ]);

// Example 1: Basic for-comprehension style
const fetchUserData = gen {
  user <- getUser(123);
  profile <- getProfile(user.id);
  posts <- getPosts(user.id);
  return { user, profile, posts };
};

// Example 2: With local variables
const processUser = gen {
  user <- getUser(456);
  let displayName = user.name.toUpperCase();
  let initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("");
  return { displayName, initials, email: user.email };
};

// Example 3: Chained transformations
const pipeline = gen {
  raw <- Effect.succeed({ data: [1, 2, 3] });
  let doubled = raw.data.map((x) => x * 2);
  let sum = doubled.reduce((a, b) => a + b, 0);
  result <- Effect.succeed({ doubled, sum });
  return result;
};

// Example 4: Error handling with Effect.try
const safeOperation = gen {
  config <- Effect.succeed({
    apiUrl: "https://api.example.com",
  });
  result <- Effect.try({
    try: () => JSON.parse('{"valid": true}'),
    catch: (e) => new Error(`Parse failed: ${e}`),
  });
  return { config, result };
};

// Example 5: Conditional logic
const conditionalFlow = gen {
  value <- Effect.succeed(42);
  let isPositive = value > 0;
  if (isPositive) {
    return `Positive: ${value}`;
  } else {
    return `Non-positive: ${value}`;
  }
};

// Run examples
const main = gen {
  yield* Console.log("=== Effect-TS Sugar Examples ===\n");

  const userData = yield* fetchUserData;
  yield* Console.log("User Data:", JSON.stringify(userData, null, 2));

  const processed = yield* processUser;
  yield* Console.log("\nProcessed User:", JSON.stringify(processed, null, 2));

  const pipelineResult = yield* pipeline;
  yield* Console.log(
    "\nPipeline Result:",
    JSON.stringify(pipelineResult, null, 2)
  );

  const safe = yield* safeOperation;
  yield* Console.log("\nSafe Operation:", JSON.stringify(safe, null, 2));

  const conditional = yield* conditionalFlow;
  yield* Console.log("\nConditional:", conditional);
};

// Effect.runPromise(main)
