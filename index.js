const {ApolloServer} = require('@apollo/server')
const {expressMiddleware} = require('@apollo/server/express4')
const {json} = require('body-parser')
const cors = require('cors')
const express = require('express')
const {makeExecutableSchema} = require('@graphql-tools/schema')
const app = express()
const {createServer} = require('http')
const {WebSocketServer} = require('ws')
const {useServer} = require('graphql-ws/lib/use/ws')
const {
  ApolloServerPluginDrainHttpServer
} = require('@apollo/server/plugin/drainHttpServer');
const {PubSub} = require('graphql-subscriptions')
const pubsub = new PubSub();
const movies = [
  {
    movieTitle: "Avengers-Endgame",
    dateOfRelease: "2019",
  }
]

const main = async () => {
  const typeDefs = `#graphql
    type Movie {
      movieTitle: String!
      dateOfRelease: String!
    }

    type Query {
      queryMovies: [Movie]!
    }

    type Mutation {
      addMovie(movieTitle: String!, dateOfRelease: String!): Movie!
    }

    type Subscription { 
      newMovie: [Movie!]!
    }
  `;

  const resolvers = {
    Query: {
      queryMovies: () => movies
    },

    Mutation: {
      addMovie: (parent, args) => {
        movies.push(args)
        pubsub.publish('MOVIE_ADDED', { newMovie: movies })
        return args
      },
    },

    Subscription: {
      newMovie: {
       subscribe: () => pubsub.asyncIterator(["MOVIE_ADDED"]),
      },
     },
  }

  const schema = makeExecutableSchema({ typeDefs, resolvers });
  const httpServer = createServer(app);

  // Creating the WebSocket server
  const wsServer = new WebSocketServer({
    // This is the `httpServer` we created in a previous step.
    server: httpServer,
    path: '/',
  });

  // Save the returned server's info so we can shutdown this server later
  const serverCleanup = useServer({ schema }, wsServer);
  
  const server = new ApolloServer({
    schema,
    // —--------------(ADD HERE)-----------------
    plugins: [
      // Proper shutdown for the HTTP server.
      ApolloServerPluginDrainHttpServer({ httpServer }),
  
      // Proper shutdown for the WebSocket server.
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ]
  })

  await server.start();

  app.use(
    '/',
    cors(),
    json(),
    expressMiddleware(server)
  )

  const PORT = process.env.PORT || 8080
  httpServer.listen(PORT, ()=>{
    console.log(`GraphQL server running at ${PORT}`)
  })
}

main();