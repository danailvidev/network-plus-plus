export type GraphQLOperationType = 'query' | 'mutation' | 'subscription';

export type GraphQLInfo = {
  operationType?: GraphQLOperationType;
  operationName?: string;
  query?: string;
  variables?: unknown;
  data?: unknown;
  errors?: unknown[];
  batched?: boolean;
  operations?: GraphQLInfo[];
};
