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

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
          (order) => order.status === "paid"
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
          (o) => o.status === "paid"
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
          (order) => order.status === "paid"
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

    // app.post("/orders", async (req, res) => {
    //   try {
    //     const order = req.body;

    //     // ✅ DATE FORMAT dd/mm/yyyy
    //     const now = new Date();
    //     const formattedDate =
    //       String(now.getDate()).padStart(2, "0") +
    //       "/" +
    //       String(now.getMonth() + 1).padStart(2, "0") +
    //       "/" +
    //       now.getFullYear();

    //     order.createdAt = formattedDate;

    //     // ✅ AUTO TXN ID (unique)
    //     order.txnId =
    //       "TXN-" +
    //       Date.now().toString(36).toUpperCase() +
    //       "-" +
    //       Math.floor(Math.random() * 1000);

    //     // ✅ PAYMENT METHOD SAFE FIX
    //     const allowedPayments = ["cod", "bkash", "nagad"];
    //     if (!allowedPayments.includes(order.paymentMethod)) {
    //       order.paymentMethod = "cod";
    //     }

    //     // (optional) human readable version
    //     const paymentMap = {
    //       cod: "Cash on Delivery",
    //       bkash: "Bkash",
    //       nagad: "Nagad",
    //     };

    //     order.paymentLabel = paymentMap[order.paymentMethod];

    //     const result = await ordersCollection.insertOne(order);

    //     res.send({
    //       success: true,
    //       message: "Order saved successfully",
    //       txnId: order.txnId,
    //     });
    //   } catch (error) {
    //     console.log(error);
    //     res.status(500).send({
    //       success: false,
    //       message: "Order failed",
    //     });
    //   }
    // });

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


    app.post("/create-checkout-session", async (req, res) => {
      try {
        const { cartItems, deliveryInfo, buyerEmail } = req.body;

        if (!cartItems || cartItems.length === 0) {
          return res.status(400).send({ message: "Cart is empty" });
        }

        // স্ট্রাইপের নিয়মানুযায়ী প্রোডাক্ট লিস্ট ম্যাপ করা
        const lineItems = cartItems.map((item) => ({
          price_data: {
            currency: "bdt",
            product_data: {
              name: item.title,
              images: [item.imageUrl || "https://placehold.co/150"],
            },
            unit_amount: Math.round(Number(item.price) * 100),
          },
          quantity: item.quantity,
        }));

        // ইউনিক ডেমো অর্ডার আইডি এবং ট্রানজেকশন আইডি জেনারেট করা
        const tempTxnId = "TXN-" + Date.now().toString(36).toUpperCase();

        // স্ট্রাইপ ডেমো পেমেন্ট সেশন তৈরি
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: lineItems,
          mode: "payment",

          // পেমেন্ট সফল হলে এই লিংকে ব্যাক করবে এবং URL এ সেশন আইডি থাকবে
          success_url: `${process.env.CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL}/cart`,

          // ডাটাবেজের জন্য মেটাডাটা পাঠানো (পেমেন্ট শেষে রিসিভ করার জন্য)
          metadata: {
            buyerEmail: buyerEmail,
            txnId: tempTxnId,
            deliveryInfo: JSON.stringify(deliveryInfo),

            // সম্পূর্ণ কার্ট আইটেমের ডাটা স্ট্রিং আকারে সাময়িক স্টোর করা
            cartItems: JSON.stringify(cartItems.map(item => ({
              productId: item._id,
              title: item.title,
              price: item.price,
              quantity: item.quantity,
              sellerEmail: item.sellerEmail || "",
              imageUrl: item.imageUrl || "",
            })))
          },
        });

        // ফ্রন্টএন্ডে স্ট্রাইপ পেমেন্ট পেজের URL রেসপন্স পাঠানো
        res.send({ url: session.url });

      } catch (error) {
        console.error("Stripe Session Error:", error);
        res.status(500).send({ success: false, message: error.message });
      }
    });

    //  VERIFY PAYMENT AND SAVE ORDER TO DB
    app.post("/verify-payment", async (req, res) => {
      try {
        const { session_id } = req.body;

        if (!session_id) {
          return res.status(400).send({ message: "Session ID is required" });
        }

        // স্ট্রাইপ থেকে সেশনের আসল স্ট্যাটাস চেক করা (সিকিউরিটির জন্য)
        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === "paid") {

          // সেশন আইডি অলরেডি ডাটাবেজে আছে কিনা চেক করা (যাতে ডুপ্লিকেট রিকোয়েস্ট না হয়)
          const existingOrder = await ordersCollection.findOne({ stripeSessionId: session_id });
          if (existingOrder) {
            return res.send({ success: true, message: "Already processed", order: existingOrder });
          }

          // মেটাডাটা থেকে ট্রানজেকশন ও কার্টের ইনফো বের করা
          const metadata = session.metadata;
          const cartItems = JSON.parse(metadata.cartItems);
          const deliveryInfo = JSON.parse(metadata.deliveryInfo);

          // ডেট ফরমেট করা (dd/mm/yyyy) - আপনার আগের মেথড অনুযায়ী
          const now = new Date();
          const formattedDate =
            String(now.getDate()).padStart(2, "0") + "/" +
            String(now.getMonth() + 1).padStart(2, "0") + "/" +
            now.getFullYear();

          // প্রত্যেকটা আলাদা প্রোডাক্টের জন্য অর্ডার ডাটাবেজে ইনসার্ট করা
          // (আপনার আগের আর্কিটেকচার অনুযায়ী যেখানে প্রতি প্রোডাক্টে সেলার ইমেইল ট্র্যাক হয়)
          const ordersToInsert = cartItems.map((item) => ({
            buyerEmail: metadata.buyerEmail,
            sellerEmail: item.sellerEmail,
            productTitle: item.title,
            productId: item.productId,
            price: Number(item.price) * Number(item.quantity),
            quantity: item.quantity,
            imageUrl: item.imageUrl,
            status: "paid",
            paymentMethod: "stripe",
            paymentLabel: "Stripe Secure Card",
            txnId: metadata.txnId,
            stripeSessionId: session_id,
            createdAt: formattedDate,
            deliveryInfo: deliveryInfo
          }));

          // ডাটাবেজে একবারে সব অর্ডার সেভ করা
          const result = await ordersCollection.insertMany(ordersToInsert);

          return res.send({
            success: true,
            message: "Payment verified and order saved!",
            txnId: metadata.txnId,
            amount: session.amount_total / 100,
            date: formattedDate,
            orders: ordersToInsert
          });
        } else {
          return res.status(400).send({ success: false, message: "Payment not completed" });
        }

      } catch (error) {
        console.error("Payment Verification Error:", error);
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get("/api/admin/overview", async (req, res) => {
      try {
        // ১. আপনার কালেকশন বা টেবিল থেকে কাউন্ট বের করা (এখানে কালেকশনের নাম আপনার প্রজেক্ট অনুযায়ী পরিবর্তন করতে পারেন)
        const totalUsers = await db.collection("user").countDocuments({});
        const totalProducts = await db.collection("sellerProduct").countDocuments({});
        const totalOrders = await db.collection("orders").countDocuments({});

        // ২. শুধুমাত্র 'paid' স্ট্যাটাসের টোটাল রেভিনিউ হিসাব করা
        const paidOrders = await db.collection("orders").find({ status: "paid" }).toArray();
        const totalRevenue = paidOrders.reduce((sum, order) => sum + Number(order.price || 0), 0);

        // ৩. ডেমো চার্ট ডাটা (গত ৭ দিনের রেভিনিউ গ্রাফের জন্য)
        const chartData = [
          { day: "Sat", revenue: totalRevenue * 0.1 },
          { day: "Sun", revenue: totalRevenue * 0.3 },
          { day: "Mon", revenue: totalRevenue * 0.2 },
          { day: "Tue", revenue: totalRevenue * 0.5 },
          { day: "Wed", revenue: totalRevenue * 0.4 },
          { day: "Thu", revenue: totalRevenue * 0.7 },
          { day: "Fri", revenue: totalRevenue } // ফাইনাল কারেন্ট রেভিনিউ গ্রাফ লাইন
        ];

        // ৪. সাম্প্রতিক ৫টি অর্ডার বের করা
        const recentOrders = await db.collection("orders")
          .find({})
          .sort({ _id: -1 }) // একদম নতুনগুলো আগে আসবে
          .limit(5)
          .toArray();

        res.status(200).send({
          success: true,
          data: {
            totalUsers,
            totalProducts,
            totalOrders,
            totalRevenue,
            chartData,
            recentOrders
          }
        });

      } catch (error) {
        console.error("Admin Overview Error:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
      }
    });

    //(READ)
    app.get("/api/admin/users", async (req, res) => {
      try {
        const users = await db.collection("user").find({}).sort({ _id: -1 }).toArray();
        res.status(200).json({ success: true, users });
      } catch (error) {
        console.error("Admin Get Users Error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
      }
    });

    // (UPDATE STATUS / ROLE)
    app.patch("/api/admin/users/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { status, role } = req.body;
        const { ObjectId } = require("mongodb");

        let updateFields = {};
        if (status) updateFields.status = status;
        if (role) updateFields.role = role;

        const result = await db.collection("user").updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields }
        );

        if (result.modifiedCount > 0) {
          res.status(200).json({ success: true, message: "User updated successfully." });
        } else {
          res.status(400).json({ success: false, message: "No changes made." });
        }
      } catch (error) {
        console.error("Admin Update User Error:", error);
        res.status(500).json({ success: false, message: "Server error." });
      }
    });

    // (DELETE)
    app.delete("/api/admin/users/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { ObjectId } = require("mongodb");

        const result = await db.collection("user").deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount > 0) {
          res.status(200).json({ success: true, message: "User deleted permanently." });
        } else {
          res.status(404).json({ success: false, message: "User not found." });
        }
      } catch (error) {
        console.error("Admin Delete User Error:", error);
        res.status(500).json({ success: false, message: "Server error." });
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
