const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');


dotenv.config()
const app = express()
const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI

app.use(cors())
app.use(express.json())

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// const jwks = createRemoteJWKSet(
//   new URL(`${process.env.CLIENT_URL}/api/auth/jwks`)
// )

// const verifyToken = async (req, res, next) => {
//   const header = req?.headers.authorization
//   if (!header) {
//     return res.status(401).json({ message: 'Unauthorized' });
//   }
//   const token = header.split(" ")[1]
//   console.log("TOKEN:", token);
//   if (!token) {
//     return res.status(401).json({ message: 'Unauthorized' });
//   }
//   try {
//     const { payload } = await jwtVerify(token, jwks)
//     console.log(payload)
//     next()
//   } catch (error) {
//     return res.status(403).json({ message: 'Forbidden' });
//   }

// }

async function run() {
  try {
    await client.connect();
    const db = client.db('TradeNest')
    const TradeNestData = db.collection('sellerProduct')
    const ordersCollection = db.collection("orders");
    const wishlistCollection = db.collection("wishlist");

    app.post('/seller/add-product', async (req, res) => {
      try {
        const product = req.body;

        const result = await TradeNestData.insertOne(product);

        res.send(result);

      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    app.get("/seller/my-products/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const result = await TradeNestData
          .find({ sellerEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    app.delete("/seller/product/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await TradeNestData.deleteOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.patch("/seller/product/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        const result = await TradeNestData.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: updatedData,
          }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.get("/seller/product/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await TradeNestData.findOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    app.get("/seller/dashboard/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const products = await TradeNestData.find({
          sellerEmail: email,
        }).toArray();

        const orders = await ordersCollection.find({
          sellerEmail: email,
        }).toArray();

        const paymentHistory = orders
          .filter((order) => order.paymentMethod)
          .slice(0, 10);

        const totalProducts = products.length;

        const totalSales = orders.length;

        const totalRevenue = orders.reduce(
          (sum, order) =>
            sum + Number(order.price || 0),
          0
        );

        const pendingOrders = orders.filter(
          (order) => order.status === "pending"
        ).length;

        const recentOrders = orders
          .sort(
            (a, b) =>
              new Date(b.createdAt) -
              new Date(a.createdAt)
          )
          .slice(0, 5);

        const productSalesMap = {};

        orders.forEach((order) => {
          if (!productSalesMap[order.productTitle]) {
            productSalesMap[order.productTitle] = {
              name: order.productTitle,
              sales: 0,
              revenue: 0,
            };
          }

          productSalesMap[
            order.productTitle
          ].sales += Number(order.quantity || 1);

          productSalesMap[
            order.productTitle
          ].revenue += Number(order.price || 0);
        });

        const topProducts = Object.values(
          productSalesMap
        )
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 5);

        res.send({
          totalProducts,
          totalSales,
          totalRevenue,
          pendingOrders,
          recentOrders,
          topProducts,
          paymentHistory,
        });
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    app.get("/seller/dashboard/display-cards/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const products = await TradeNestData.find({
          sellerEmail: email,
        }).toArray();

        const orders = await ordersCollection.find({
          sellerEmail: email,
        }).toArray();

        //  ALL ORDERS (not only completed)
        const totalProducts = products.length;

        const totalSales = orders.reduce(
          (sum, order) => sum + Number(order.quantity || 1),
          0
        );

        const totalRevenue = orders.reduce(
          (sum, order) => sum + Number(order.price || 0),
          0
        );

        const pendingOrders = orders.filter(
          (o) => o.status === "pending"
        ).length;

        res.send({
          totalProducts,
          totalSales,
          totalRevenue,
          pendingOrders,
        });

      } catch (error) {
        res.status(500).send({
          success: false,
          message: error.message,
        });
      }
    });

    app.get("/sellerProduct", async (req, res) => {
      try {
        const products = await TradeNestData
          .find()
          .toArray();

        res.send(products);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to fetch products",
        });
      }
    });

    app.get("/sellerProduct/:id", async (req, res) => {
      try {
        const { id } = req.params;

        console.log("Requested ID:", id);

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid product id",
          });
        }

        const product = await TradeNestData.findOne({
          _id: new ObjectId(id),
        });

        if (!product) {
          return res.status(404).send({
            message: "Product not found",
          });
        }

        res.send(product);
      } catch (error) {
        console.error("ERROR:", error);

        res.status(500).send({
          message: "Failed to fetch product",
        });
      }
    });

    app.post("/wishlist", async (req, res) => {
      try {
        const wishlistItem = req.body;

        const existing = await wishlistCollection.findOne({
          productId: wishlistItem.productId,
        });

        if (existing) {
          await wishlistCollection.deleteOne({
            productId: wishlistItem.productId,
          });

          return res.send({
            message: "Removed from wishlist",
          });
        }

        wishlistItem.createdAt = new Date();

        await wishlistCollection.insertOne(wishlistItem);

        res.send({
          message: "Added to wishlist",
        });
      } catch (error) {
        console.log(error);
        res.status(500).send({
          message: "Wishlist error",
        });
      }
    });

    app.get("/wishlist", async (req, res) => {
      const result = await wishlistCollection.find().toArray();
      res.send(result);
    });

    app.delete("/wishlist/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await wishlistCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    app.get("/my-orders/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const result = await ordersCollection
          .find({ buyerEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    app.patch("/orders/cancel/:id", async (req, res) => {
      try {
        const id = req.params.id;

        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "cancelled",
            },
          }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    app.get("/seller/orders/:email", async (req, res) => {
      const email = req.params.email;

      const orders = await ordersCollection
        .find({ sellerEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(orders);
    });

    app.patch("/orders/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to update order" });
      }
    });

    app.get("/buyer/dashboard/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const orders = await ordersCollection
          .find({ buyerEmail: email })
          .toArray();

        const wishlist = await wishlistCollection
          .find({ buyerEmail: email })
          .toArray();

        const totalOrders = orders.length;

        const pendingOrders = orders.filter(
          (order) => order.status === "pending"
        ).length;

        const totalSpent = orders.reduce(
          (sum, order) => sum + Number(order.price || 0),
          0
        );

        res.send({
          totalOrders,
          wishlistCount: wishlist.length,
          totalSpent,
          pendingOrders,
          recentOrders: orders.slice(0, 5),
          wishlist: wishlist.slice(0, 5),
          recentPurchases: orders.slice(0, 4),
        });
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    app.post("/orders", async (req, res) => {
      try {
        const order = req.body;

        // ✅ DATE FORMAT dd/mm/yyyy
        const now = new Date();
        const formattedDate =
          String(now.getDate()).padStart(2, "0") +
          "/" +
          String(now.getMonth() + 1).padStart(2, "0") +
          "/" +
          now.getFullYear();

        order.createdAt = formattedDate;

        // ✅ AUTO TXN ID (unique)
        order.txnId =
          "TXN-" +
          Date.now().toString(36).toUpperCase() +
          "-" +
          Math.floor(Math.random() * 1000);

        // ✅ PAYMENT METHOD SAFE FIX
        const allowedPayments = ["cod", "bkash", "nagad"];
        if (!allowedPayments.includes(order.paymentMethod)) {
          order.paymentMethod = "cod";
        }

        // (optional) human readable version
        const paymentMap = {
          cod: "Cash on Delivery",
          bkash: "Bkash",
          nagad: "Nagad",
        };

        order.paymentLabel = paymentMap[order.paymentMethod];

        const result = await ordersCollection.insertOne(order);

        res.send({
          success: true,
          message: "Order saved successfully",
          txnId: order.txnId,
        });
      } catch (error) {
        console.log(error);
        res.status(500).send({
          success: false,
          message: "Order failed",
        });
      }
    });

    app.get("/payment-history/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const payments = await ordersCollection
          .find({ buyerEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(payments);
      } catch (error) {
        res.status(500).send({
          message: error.message,
        });
      }
    });

    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
