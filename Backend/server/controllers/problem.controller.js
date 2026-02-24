import { db } from "../database/dbconfig.js";
import {
  getJudge0LanguageId,
  pollBatchResults,
  submitBatch,
} from "../libs/judge0.lib.js";
import logger from "../loggers/logger.js";

export const createProblem = async (req, res) => {
  // getting all the data from the request body
    const {
    title,
    description,
    difficulty,
    tags,
    examples,
    constraints,
    testcases,
    codeSnippets,
    referenceSolutions,
  } = req.body;

  // Defense-in-depth: re-verify admin role at the controller level
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "You are not allowed to create a problem" });
  }

  try {
    //loop through each reference solution for different languages
    for (const [language, solutionCode] of Object.entries(referenceSolutions)) {
      const languageId = getJudge0LanguageId(language);
     // check if the language is supported
      if (!languageId) {
        return res
          .status(400)
          .json({ error: `Language ${language} is not supported` });
      }

      // create submissions for each testcase
      const submissions = testcases.map(({ input, output }) => ({
        source_code: solutionCode,
        language_id: languageId,
        stdin: input,
        expected_output: output,
      }));

      // submit in chunks of 20 to avoid Judge0 batch limits
      const BATCH_SIZE = 20;
      const allResults = [];

      for (let start = 0; start < submissions.length; start += BATCH_SIZE) {
        const chunk = submissions.slice(start, start + BATCH_SIZE);

        const submissionResults = await submitBatch(chunk);
        const tokens = submissionResults.map((r) => r.token);
        const results = await pollBatchResults(tokens);

        allResults.push(...results);
      }

      for (let i = 0; i < allResults.length; i++) {
        const result = allResults[i];
        logger.info("Result-----", result);
        if (result.status.id !== 3) {
          return res.status(400).json({
            error: `Testcase ${i + 1} failed for language ${language}`,
          });
        }
      }
    }

    const newProblem = await db.problem.create({
      data: {
        title,
        description,
        difficulty,
        tags,
        examples,
        constraints,
        testcases,
        codeSnippets,
        referenceSolutions,
        userId: req.user.id,
      },
    });

    return res.status(201).json({
      sucess: true,
      message: "Message Created Successfully",
      problem: newProblem,
    });
  } catch (error) {
    logger.error("Error while creating problem:", error);
    return res.status(500).json({
      error: "Error While Creating Problem",
    });
  }
};

export const getAllProblems = async (req, res) => {
  try {
    const problems = await db.problem.findMany(
      {
        include:{
          solvedBy:{
            where:{
              userId:req.user.id
            }
          }
        }
      }
    );

    if (!problems) {
      return res.status(404).json({
        error: "No problems Found",
      });
    }

    res.status(200).json({
      sucess: true,
      message: "Message Fetched Successfully",
      problems,
    });
  } catch (error) {
    logger.error("Error while fetching problems:", error);
    return res.status(500).json({
      error: "Error While Fetching Problems",
    });
  }
};

export const getProblemById = async (req, res) => {
  const { id } = req.params;

  try {
    const problem = await db.problem.findUnique({
      where: {
        id,
      },
    });

    if (!problem) {
      return res.status(404).json({ error: "Problem not found." });
    }

    return res.status(200).json({
      sucess: true,
      message: "Message Created Successfully",
      problem,
    });
  } catch (error) {
    logger.error("Error while fetching problem by id:", error);
    return res.status(500).json({
      error: "Error While Fetching Problem by id",
    });
  }
};

// TODO: IMPLEMENT BY YOUR SELF🔥
export const updateProblem = async (req, res) => {
  // id
  // id--->problem ( condition)
  // baaki kaam same as create
};

export const deleteProblem = async (req, res) => {
  const { id } = req.params;

  try {
    const problem = await db.problem.findUnique({ where: { id } });

    if (!problem) {
      return res.status(404).json({ error: "Problem Not found" });
    }

    await db.problem.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: "Problem deleted Successfully",
    });
  } catch (error) {
    logger.error("Error while deleting problem:", error);
    return res.status(500).json({
      error: "Error While deleting the problem",
    });
  }
};

export const getAllProblemsSolvedByUser = async (req, res) => {
  try {
    const problems = await db.problem.findMany({
      where:{
        solvedBy:{
          some:{
            userId:req.user.id
          }
        }
      },
      include:{
        solvedBy:{
          where:{
            userId:req.user.id
          }
        }
      }
    })

    res.status(200).json({
      success:true,
      message:"Problems fetched successfully",
      problems
    })
  } catch (error) {
    logger.error("Error fetching solved problems:", error);
    res.status(500).json({error:"Failed to fetch problems"})
  }
};