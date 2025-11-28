const swaggerJSDoc = require("swagger-jsdoc");
const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Inventory API",
      version: "1.0.0",
      description: "Inventory management service",
    },
  },
  apis: ["./main.js"],
});
module.exports = swaggerSpec;
