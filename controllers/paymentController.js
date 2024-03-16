import { catchAsyncError } from "../middlewares/catchAsyncError.js";
import { User } from "../models/User.js";
import ErrorHandler from "../utils/errorHandler.js";
import { instance } from "../server.js"
import crypto from "crypto"
import { Payment } from "../models/Payment.js";

export const buySubscription = catchAsyncError(async (req, res, next) => {

    const user = await User.findById(req.user._id);

    if (user.role === "admin") return next(new ErrorHandler("Admin can't buy subscription ", 404))

    const plan_id = process.env.PLAN_ID;

    const subscription = await instance.subscriptions.create({
        plan_id: plan_id,
        customer_notify: 1,
        total_count: 12,
    });


    user.subscription.id = subscription.id;
    user.subscription.status = subscription.status;

    await user.save();

    res.status(201).json({
        success: true,
        subscription
    })

})

export const paymentVerification = catchAsyncError(async (req, res, next) => {

    console.log("1:");

    const { razorpay_signature, razorpay_payment_id, razorpay_subscription_id } = req.body;

    console.log("2:", razorpay_signature, razorpay_payment_id, razorpay_subscription_id);

    const user = await User.findById(req.user._id);

    console.log("3:", user);

    const subscription_id = user.subscription.id;

    console.log("4:", subscription_id);

    const generated_signature = crypto.createHmac("sha256", process.env.RAZORPAY_API_SECRET)
        .update(razorpay_payment_id + "|" + subscription_id, "utf-8").digest("hex");

    console.log("5:", generated_signature);

    const isAuthentic = generated_signature === razorpay_signature;

    console.log("6:", isAuthentic);

    if (!isAuthentic) return res.redirect(`${process.env.FRONTEND_URL}/paymentfail`);

    await Payment.create({
        razorpay_signature,
        razorpay_payment_id,
        razorpay_subscription_id
    });

    console.log("6: Saved 1");

    user.subscription.status = "active";
    
    console.log("7: Saved 2");

    await user.save();

    console.log("7: Saved 3");

    res.redirect(`${process.env.FRONTEND_URL}/paymentsuccess?reference=${razorpay_payment_id}`);

})


export const getRazorPayKey = catchAsyncError(async (req, res, next) => {
    res.status(200).json({
        success: true,
        key: process.env.RAZORPAY_API_KEY
    })
});

export const cancelSubscription = catchAsyncError(async (req, res, next) => {

    const user = await User.findById(req.user._id);

    const subscriptionId = user.subscription.id;

    let refund = false;

    await instance.subscriptions.cancel(subscriptionId);

    const payment = await Payment.findOne({
        razorpay_subscription_id: subscriptionId
    });

    const gap = Date.now() - payment.createdAt;

    const refundTime = process.env.REFUND_DAYS * 24 * 60 * 60 * 1000;

    if (refundTime > gap) {
        // await instance.payments.refund(payment.razorpay_payment_id);
        refund = true;
    }

    await payment.deleteOne();

    user.subscription.id = undefined;
    user.subscription.status = undefined;

    await user.save();

    res.status(200).json({
        success: true,
        message:
            refund ? "Subscription cancelled, You will receive full refund within 7 days."
                : "Subscription cancelled, YNo refund was initiated as subscription was cancelled after 7 days."
    })
});
