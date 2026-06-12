import type { GraphQLInfo } from '../graphql/graphql-model';
import { stringifyUnknown } from '../utils/format';

type GraphQLDetailsProps = {
  graphql: GraphQLInfo | undefined;
};

const OperationSummary = ({ operation }: { operation: GraphQLInfo }) => (
  <div className="graphql-summary">
    <span>Type: {operation.operationType ?? 'unknown'}</span>
    <span>Name: {operation.operationName ?? 'anonymous'}</span>
    <span>Errors: {operation.errors?.length ?? 0}</span>
  </div>
);

export const GraphQLDetails = ({ graphql }: GraphQLDetailsProps) => {
  if (!graphql) {
    return <div className="empty-state compact">This request was not detected as GraphQL.</div>;
  }

  return (
    <div className="details-stack">
      <OperationSummary operation={graphql} />

      {graphql.batched && graphql.operations?.length ? (
        <section className="details-card">
          <h3>Batched Operations</h3>
          <div className="batched-list">
            {graphql.operations.map((operation, index) => (
              <div className="batched-operation" key={`${operation.operationName ?? 'anonymous'}-${index}`}>
                <OperationSummary operation={operation} />
                {operation.query ? <pre>{operation.query}</pre> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="details-card">
        <h3>Query</h3>
        <pre>{graphql.query || 'No query document captured.'}</pre>
      </section>

      <section className="details-card">
        <h3>Variables</h3>
        <pre>{stringifyUnknown(graphql.variables) || 'No variables captured.'}</pre>
      </section>

      <section className="details-card">
        <h3>Response Data</h3>
        <pre>{stringifyUnknown(graphql.data) || 'No response data captured.'}</pre>
      </section>

      <section className="details-card">
        <h3>Errors</h3>
        <pre>{stringifyUnknown(graphql.errors) || 'No GraphQL errors detected.'}</pre>
      </section>
    </div>
  );
};
