const {
  onDocumentCreated
} = require("firebase-functions/v2/firestore");

const {
  initializeApp
} = require("firebase-admin/app");

const {
  getFirestore,
  FieldValue
} = require("firebase-admin/firestore");

const {
  getAuth
} = require("firebase-admin/auth");

const {
  getMessaging
} = require("firebase-admin/messaging");


/* =========================================
   INITIALIZE FIREBASE ADMIN
========================================= */

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();
const messaging = getMessaging();


/* =========================================
   SUPER ADMIN EMAIL
========================================= */

const SUPER_ADMIN_EMAIL =
  "jonathanmentor62@gmail.com";


/* =========================================
   NEW JDA NETWORKS REGISTRATION
========================================= */

exports.notifyNewRegistration = onDocumentCreated(
  "users/{uid}",
  async (event) => {

    const snapshot = event.data;

    if (!snapshot) {
      console.log("No registration document found.");
      return;
    }


    const newUser = snapshot.data();

    console.log(
      "New JDA Networks registration:",
      newUser.realName
    );


    /* =====================================
       ONLY PROCESS PENDING REGISTRATIONS
    ===================================== */

    if (newUser.status !== "pending") {
      console.log(
        "User is not pending. Notification skipped."
      );
      return;
    }


    const registrationUid = event.params.uid;


    /* =====================================
       FIND ADMINISTRATORS
    ===================================== */

    const adminIds = new Set();


    /*
      Add the main/super administrator.
    */

    try {

      const superAdminUser =
        await adminAuth.getUserByEmail(
          SUPER_ADMIN_EMAIL
        );

      adminIds.add(superAdminUser.uid);

    } catch (error) {

      console.error(
        "Could not find super administrator:",
        error
      );

    }


    /*
      Add all users listed in admins collection.
    */

    try {

      const adminsSnapshot =
        await db.collection("admins").get();

      adminsSnapshot.forEach((adminDoc) => {

        adminIds.add(adminDoc.id);

      });

    } catch (error) {

      console.error(
        "Could not load admin accounts:",
        error
      );

    }


    console.log(
      "Administrators found:",
      Array.from(adminIds)
    );


    /* =====================================
       INFORMATION ABOUT NEW MEMBER
    ===================================== */

    const memberName =
      newUser.realName || "New member";

    const accountType =
      newUser.accountType || "member";

    const jdaNumber =
      newUser.jdaNumber || "";

    let extraInformation = "";


    if (accountType === "student") {

      extraInformation =
        `${newUser.class || ""} ${newUser.stream || ""}`
          .trim();

    }


    if (accountType === "staff") {

      extraInformation =
        newUser.department || "";

    }


    const notificationTitle =
      "New JDA Networks Registration";


    const notificationMessage =
      `${memberName} has registered as a ${accountType}.`;


    /* =====================================
       CREATE ADMIN NOTIFICATIONS
    ===================================== */

    for (const adminUid of adminIds) {

      try {

        const notificationId =
          `${adminUid}_${registrationUid}`;


        await db
          .collection("notifications")
          .doc(notificationId)
          .set({

            type: "new_registration",

            userId: adminUid,

            registrationUid: registrationUid,

            title: notificationTitle,

            message: notificationMessage,

            memberName: memberName,

            jdaNumber: jdaNumber,

            accountType: accountType,

            class:
              accountType === "student"
                ? newUser.class || ""
                : "",

            stream:
              accountType === "student"
                ? newUser.stream || ""
                : "",

            department:
              accountType === "staff"
                ? newUser.department || ""
                : "",

            profilePhoto:
              newUser.profilePhoto || "",

            email:
              newUser.email || "",

            extraInformation:

              extraInformation,

            read: false,

            createdAt:
              FieldValue.serverTimestamp()

          });


        console.log(
          "Admin notification created for:",
          adminUid
        );


        /* =================================
           GET ADMIN DEVICE TOKENS
        ================================= */

        const tokenSnapshot =
          await db
            .collection("deviceTokens")
            .where(
              "userId",
              "==",
              adminUid
            )
            .get();


        const tokens = [];


        tokenSnapshot.forEach((tokenDoc) => {

          const tokenData =
            tokenDoc.data();

          if (tokenData.token) {

            tokens.push({
              token: tokenData.token,
              documentId: tokenDoc.id
            });

          }

        });


        /* =================================
           SEND PHONE PUSH NOTIFICATION
        ================================= */

        if (tokens.length > 0) {

          const tokenValues =
            tokens.map((item) => item.token);


          const response =
            await messaging.sendEachForMulticast({

              tokens: tokenValues,

              notification: {

                title:
                  "JDA Networks",

                body:
                  `${memberName} has submitted a new registration.`

              },

              data: {

                type:
                  "new_registration",

                registrationUid:
                  registrationUid,

                memberName:
                  memberName,

                accountType:
                  accountType,

                jdaNumber:
                  jdaNumber

              }

            });


          console.log(
            `Push notifications sent: ${response.successCount}`
          );


          console.log(
            `Push notifications failed: ${response.failureCount}`
          );


          /* ===============================
             REMOVE INVALID TOKENS
          =============================== */

          for (
            let i = 0;
            i < response.responses.length;
            i++
          ) {

            const result =
              response.responses[i];


            if (!result.success) {

              const errorCode =
                result.error?.code || "";


              if (

                errorCode.includes(
                  "registration-token-not-registered"
                )

                ||

                errorCode.includes(
                  "invalid-registration-token"
                )

              ) {

                try {

                  await db
                    .collection("deviceTokens")
                    .doc(tokens[i].documentId)
                    .delete();


                  console.log(
                    "Removed invalid device token."
                  );

                } catch (deleteError) {

                  console.error(
                    "Could not remove invalid token:",
                    deleteError
                  );

                }

              }

            }

          }

        } else {

          console.log(
            "No admin device token found. In-app notification was still created."
          );

        }

      } catch (error) {

        console.error(
          `Notification failed for admin ${adminUid}:`,
          error
        );

      }

    }


    console.log(
      "New registration notification process completed."
    );

  }
);
