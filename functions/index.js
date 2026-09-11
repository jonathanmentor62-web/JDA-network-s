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
   SUPER ADMIN
========================================= */

const SUPER_ADMIN_EMAIL =
  "jonathanmentor62@gmail.com";


/* =========================================
   NEW REGISTRATION
========================================= */

exports.notifyNewRegistration = onDocumentCreated(
  "users/{uid}",
  async (event) => {

    try {

      const snapshot = event.data;

      if (!snapshot) {
        console.log("No registration document found.");
        return;
      }


      /* =====================================
         AUTOMATIC UID
      ===================================== */

      const registrationUid =
        event.params.uid;

      const newUser =
        snapshot.data();


      console.log(
        "================================="
      );

      console.log(
        "NEW JDA REGISTRATION"
      );

      console.log(
        "UID:",
        registrationUid
      );

      console.log(
        "Name:",
        newUser.realName
      );

      console.log(
        "================================="
      );


      /* =====================================
         ONLY PENDING REGISTRATIONS
      ===================================== */

      if (newUser.status !== "pending") {

        console.log(
          "Registration is not pending. Skipping."
        );

        return;
      }


      /* =====================================
         MEMBER INFORMATION
      ===================================== */

      const memberName =
        String(
          newUser.realName || "New member"
        ).trim();


      const accountType =
        String(
          newUser.accountType || "member"
        ).trim();


      const jdaNumber =
        String(
          newUser.jdaNumber || ""
        ).trim();


      const email =
        String(
          newUser.email || ""
        ).trim();


      const studentClass =
        String(
          newUser.class ||
          newUser.studentClass ||
          ""
        ).trim();


      const stream =
        String(
          newUser.stream || ""
        ).trim();


      const department =
        String(
          newUser.department || ""
        ).trim();


      /*
       * Support either photoURL or profilePhoto.
       */

      const profilePhoto =
        String(
          newUser.photoURL ||
          newUser.profilePhoto ||
          newUser.photoUrl ||
          ""
        ).trim();


      /* =====================================
         FIND ADMINISTRATORS
      ===================================== */

      const adminIds =
        new Set();


      /* =====================================
         ADD SUPER ADMIN
      ===================================== */

      try {

        const superAdminUser =
          await adminAuth.getUserByEmail(
            SUPER_ADMIN_EMAIL
          );

        adminIds.add(
          superAdminUser.uid
        );

        console.log(
          "Super admin found:",
          superAdminUser.uid
        );

      } catch (error) {

        console.error(
          "Could not find super admin:",
          error
        );

      }


      /* =====================================
         ADD OTHER ADMINS
      ===================================== */

      try {

        const adminsSnapshot =
          await db
            .collection("admins")
            .get();


        adminsSnapshot.forEach(
          adminDoc => {

            adminIds.add(
              adminDoc.id
            );

          }
        );


        console.log(
          "Admins collection loaded."
        );

      } catch (error) {

        console.error(
          "Could not load admins:",
          error
        );

      }


      /* =====================================
         CHECK ADMINS
      ===================================== */

      if (adminIds.size === 0) {

        console.error(
          "NO ADMINISTRATORS FOUND."
        );

        return;
      }


      console.log(
        "Administrators:",
        Array.from(adminIds)
      );


      /* =====================================
         EXTRA INFORMATION
      ===================================== */

      let extraInformation =
        "";


      if (
        accountType ===
        "student"
      ) {

        extraInformation =
          [
            studentClass,
            stream
          ]
          .filter(Boolean)
          .join(" • ");

      }


      if (
        accountType ===
        "staff"
      ) {

        extraInformation =
          department;

      }


      /* =====================================
         NOTIFICATION TEXT
      ===================================== */

      const notificationTitle =
        "New JDA Networks Registration";


      const notificationMessage =
        `${memberName} has registered and is waiting for approval.`;


      /* =====================================
         CREATE NOTIFICATION FOR EACH ADMIN
      ===================================== */

      for (
        const adminUid of adminIds
      ) {

        try {

          const notificationId =
            `${adminUid}_${registrationUid}`;


          /* =================================
             SAVE IN-APP NOTIFICATION
          ================================= */

          await db
            .collection("notifications")
            .doc(notificationId)
            .set({

              type:
                "new_registration",

              userId:
                adminUid,

              registrationUid:
                registrationUid,

              /*
               * This is the actual Firebase Auth UID
               * of the person who registered.
               */

              memberUid:
                registrationUid,

              title:
                notificationTitle,

              message:
                notificationMessage,

              memberName:
                memberName,

              jdaNumber:
                jdaNumber,

              accountType:
                accountType,

              class:
                accountType === "student"
                  ? studentClass
                  : "",

              stream:
                accountType === "student"
                  ? stream
                  : "",

              department:
                accountType === "staff"
                  ? department
                  : "",

              profilePhoto:
                profilePhoto,

              email:
                email,

              extraInformation:
                extraInformation,

              read:
                false,

              createdAt:
                FieldValue.serverTimestamp()

            });


          console.log(
            "In-app notification created for:",
            adminUid
          );


          /* =================================
             FIND ADMIN DEVICE TOKENS
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


          const tokens =
            [];


          tokenSnapshot.forEach(
            tokenDoc => {

              const tokenData =
                tokenDoc.data();


              if (
                tokenData.token
              ) {

                tokens.push({

                  token:
                    tokenData.token,

                  documentId:
                    tokenDoc.id

                });

              }

            }
          );


          /* =================================
             SEND PUSH NOTIFICATION
          ================================= */

          if (
            tokens.length > 0
          ) {

            const tokenValues =
              tokens.map(
                item =>
                  item.token
              );


            const response =
              await messaging
                .sendEachForMulticast({

                  tokens:
                    tokenValues,

                  notification: {

                    title:
                      "JDA Networks",

                    body:
                      `${memberName} registered and needs your approval.`

                  },

                  data: {

                    type:
                      "new_registration",

                    registrationUid:
                      registrationUid,

                    memberUid:
                      registrationUid,

                    memberName:
                      memberName,

                    accountType:
                      accountType,

                    jdaNumber:
                      jdaNumber,

                    click_action:
                      "OPEN_ADMIN"

                  }

                });


            console.log(
              "Push notification results:",
              response.successCount,
              "sent,",
              response.failureCount,
              "failed."
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


              if (
                result.success
              ) {

                continue;
              }


              const errorCode =
                result.error?.code ||
                "";


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
                    .doc(
                      tokens[i].documentId
                    )
                    .delete();


                  console.log(
                    "Removed invalid FCM token."
                  );

                } catch (deleteError) {

                  console.error(
                    "Could not delete invalid token:",
                    deleteError
                  );

                }

              }

            }

          } else {

            console.log(
              "No device token for admin:",
              adminUid
            );

          }


        } catch (adminError) {

          console.error(
            "Notification failed for admin:",
            adminUid,
            adminError
          );

        }

      }


      /* =====================================
         FINISHED
      ===================================== */

      console.log(
        "================================="
      );

      console.log(
        "REGISTRATION NOTIFICATION COMPLETE"
      ); 

      console.log(
        "Registration UID:",
        registrationUid
      );

      console.log(
        "================================="
      );


    } catch (error) {

      console.error(
        "REGISTRATION FUNCTION FAILED:",
        error
      );

    }

  }
);