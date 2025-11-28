const { program } = require("commander");
const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

program
  .requiredOption("-h, --host <host>", "Server listen host")
  .requiredOption("-p, --port <number>", "Server listen port")
  .requiredOption("-c, --cache <path>", "Path to cache directory");

program.parse();
const options = program.opts();

const { port, host, cache } = options;
const uploadsPath = path.join(cache, "uploads");
const dbFile = path.join(cache, "inventory.json");

if (!fs.existsSync(cache)) {
  fs.mkdirSync(cache, { recursive: true });
}

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath);
}
const upload = multer({ dest: uploadsPath });

if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(dbFile, JSON.stringify({ nextId: 1, list: [] }), "utf-8");
}
let inventory = JSON.parse(fs.readFileSync(dbFile));

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const formatItemResponse = (item) => {
  const photoUrl = item.photo
    ? `http://${host}:${port}/inventory/${item.id}/photo`
    : null;
  return {
    ...item,
    photo: photoUrl,
  };
};
/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register new inventory item
 *     description: Register a new inventory item with name, description and optional photo
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - inventory_name
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 description: Name of the inventory item (required)
 *               description:
 *                 type: string
 *                 description: Description of the inventory item
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: Photo file
 *     responses:
 *       200:
 *         description: Item registered successfully
 *       400:
 *         description: Name is required
 */
app.post("/register", upload.single("photo"), (req, res) => {
  let { inventory_name, description } = req.body;
  if (!inventory_name) return res.status(400).send("Name required");

  if (!description) description = "";
  const id = inventory.nextId;
  inventory.nextId += 1;

  let photo = null;
  if (req.file) photo = req.file.filename;

  const item = { id, inventory_name, description, photo };
  inventory.list.push(item);

  fs.writeFileSync(dbFile, JSON.stringify(inventory));

  res.status(200).json(formatItemResponse(item));
});

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Get all inventory items
 *     description: Retrieve list of all inventory items with photo URLs
 *     responses:
 *       200:
 *         description: List of inventory items
 */
app.get("/inventory", (req, res) => {
  const inventories = inventory.list.map(formatItemResponse);
  res.status(200).json(inventories);
});

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Get inventory item by ID
 *     description: Retrieve specific inventory item by its ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Inventory item ID
 *     responses:
 *       200:
 *         description: Inventory item found
 *       404:
 *         description: Item not found
 */
app.get("/inventory/:id", (req, res) => {
  const id = req.params.id;
  const item = inventory.list.find((v) => v.id === Number(id));
  if (item) {
    res.status(200).json(formatItemResponse(item));
  } else {
    res.status(404).json("Inventory with this id not found");
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Update inventory item
 *     description: Update name and/or description of inventory item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Inventory item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Item updated successfully
 *       404:
 *         description: Item not found
 */
app.put("/inventory/:id", (req, res) => {
  const { inventory_name, description } = req.body;

  const id = req.params.id;
  const item = inventory.list.find((v) => v.id === Number(id));

  if (!item) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json("Inventory with this id not found");
  }
  item.inventory_name = inventory_name ?? item.inventory_name;
  item.description = description ?? item.description;

  fs.writeFileSync(dbFile, JSON.stringify(inventory));

  res.status(200).json(formatItemResponse(item));
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Get inventory item photo
 *     description: Retrieve photo of specific inventory item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Inventory item ID
 *     responses:
 *       200:
 *         description: Photo file
 *         content:
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Item or photo not found
 */
app.get("/inventory/:id/photo", (req, res) => {
  const id = req.params.id;
  const item = inventory.list.find((v) => v.id === Number(id));

  if (!item) {
    res.status(404).json("Inventory with this id not found");
  } else if (item.photo === null) {
    res.status(404).json("Inventory has no photo");
  } else {
    const photoPath = path.join(uploadsPath, item.photo);

    if (!fs.existsSync(photoPath)) {
      return res.status(404).send("Photo not found");
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.sendFile(photoPath, { root: __dirname });
  }
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Update inventory item photo
 *     description: Upload new photo for inventory item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Inventory item ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: New photo file
 *     responses:
 *       200:
 *         description: Photo updated successfully
 *       404:
 *         description: Item not found
 */
app.put("/inventory/:id/photo", upload.single("photo"), (req, res) => {
  const id = req.params.id;
  const item = inventory.list.find((v) => v.id === Number(id));

  if (!item) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(404).json("Inventory with this id not found");
  }

  if (item.photo) {
    const oldPhotoPath = path.join(uploadsPath, item.photo);
    if (fs.existsSync(oldPhotoPath)) {
      fs.unlinkSync(oldPhotoPath);
    }
  }

  item.photo = req.file ? req.file.filename : null;
  fs.writeFileSync(dbFile, JSON.stringify(inventory, null, 2));

  res.status(200).json(formatItemResponse(item));
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Delete inventory item
 *     description: Remove inventory item from system
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Inventory item ID
 *     responses:
 *       200:
 *         description: Item deleted successfully
 *       404:
 *         description: Item not found
 */
app.delete("/inventory/:id", (req, res) => {
  const id = req.params.id;
  const item = inventory.list.find((v) => v.id === Number(id));

  if (!item) {
    return res.status(404).json("Inventory with this id not found");
  }

  if (item.photo) {
    const photoPath = path.join(uploadsPath, item.photo);
    if (fs.existsSync(photoPath)) {
      fs.unlinkSync(photoPath);
    }
  }

  inventory.list = inventory.list.filter((i) => i !== item);

  fs.writeFileSync(dbFile, JSON.stringify(inventory));

  res.status(200).json();
});

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Search inventory item
 *     description: Search for inventory item by ID with option to include photo link in description
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Inventory item ID to search
 *               has_photo:
 *                 type: string
 *                 description: Include photo link in description when set 'on'
 *     responses:
 *       200:
 *         description: Item found
 *       404:
 *         description: Item not found
 */
app.post("/search", (req, res) => {
  const { id, has_photo } = req.body;
  const item = inventory.list.find((v) => v.id === parseInt(id));

  if (!item) {
    return res.status(404).json("Inventory with this id not found");
  }

  const { photo, ...responseItem } = formatItemResponse(item);

  if (has_photo === "on") {
    if (photo) {
      responseItem.description += " [Photo:" + photo + "]";
    } else {
      responseItem.description += " [No photo available]";
    }
  }

  res.status(200).json(responseItem);
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}/`);
});
